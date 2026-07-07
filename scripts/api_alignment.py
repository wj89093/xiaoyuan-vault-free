#!/usr/bin/env python3
"""
api_alignment.py — 三方对齐审计 (preload API ↔ IPC handler ↔ renderer 调用)

2026-07-06 21:35 架构审计 (用户选 A)
   1. preload 暴露的所有 channel (精确提取, 含 namespace 内方法)
   2. main 注册的 ipcMain.handle channel
   3. renderer 通过 window.api.X.Y 调用的 method
   4. 找出 4 类问题:
      a. preload 暴露但 IPC 没注册 (handler 缺失 → 调必失败) P0
      b. IPC 注册但 preload 没暴露 (renderer 调不到) P1
      c. preload/IPC 都注册但 renderer 没用 (死 API) P1
      d. renderer 调了但没注册 (调用必失败) P0

改进点 (7-6 21:38):
  - namespace 内方法也提取 (之前只抓顶层 api = { ... } 的 method 名)
  - mainWindow.webContents.send 也算 IPC channel
  - renderer 不只查 window.api.X.Y, 还查 on('event') / window.api.on
"""
import re
import sys
from pathlib import Path

ROOT = Path("/Users/xindaolangu/Desktop/xiaoyuan-vault-free")
PRELOAD = ROOT / "src/preload/index.ts"
MAIN_DIR = ROOT / "src/main"
RENDERER_DIR = ROOT / "src/renderer"

def read(p):
    return Path(p).read_text()

# === 1. PRELOAD ===
preload_text = read(PRELOAD)

# 1a. 抓 handler<T>('channel', ...) 的所有 channel
#   2026-07-06: 改 [^>]+ → [\s\S]+? 让 T 能含嵌套 <> (如 handler<Array<{...}>>)
preload_channels = set()
for m in re.finditer(r"handler<[\s\S]+?>\(\s*['\"]([a-zA-Z:_-]+)['\"]", preload_text):
    preload_channels.add(m.group(1))
# 1b. 抓 ipcRenderer.invoke / on 的 channel
for m in re.finditer(r"ipcRenderer\.(?:invoke|on)\(\s*['\"]([a-zA-Z:_-]+)['\"]", preload_text):
    preload_channels.add(m.group(1))

# 1c. 抓 namespace 暴露的 method (顶层 api = { namespace, ... } 中所有 method)
preload_api_methods = set()
# 顶层 api = { method1, method2, ... }
for m in re.finditer(r"^\s+([a-zA-Z][a-zA-Z0-9]*)\??\s*:\s*[\(\)]", preload_text, re.MULTILINE):
    preload_api_methods.add(m.group(1))
# namespace: const vault = { method: () => ... } — 抓 const xxx = { ... } 里的 method 名
# 先找 const <name> = { ... } 块
namespace_blocks = {}
for m in re.finditer(r"const\s+([a-zA-Z][a-zA-Z0-9]*)\s*=\s*\{", preload_text):
    name = m.group(1)
    start = m.end()
    depth = 1
    pos = start
    while pos < len(preload_text) and depth > 0:
        ch = preload_text[pos]
        if ch == '{': depth += 1
        elif ch == '}': depth -= 1
        pos += 1
    block = preload_text[start:pos]
    # 找 method: ( ...
    for mm in re.finditer(r"^\s+([a-zA-Z][a-zA-Z0-9]*)\??\s*:\s*[\(\)]", block, re.MULTILINE):
        preload_api_methods.add(f"{name}.{mm.group(1)}")

# === 2. MAIN ===
main_text = ""
for ts in MAIN_DIR.rglob("*.ts"):
    if ".test." in ts.name:
        continue
    main_text += read(ts) + "\n"
ipc_channels = set(re.findall(r"ipcMain\.handle\(\s*['\"]([a-zA-Z:_-]+)['\"]", main_text))
ipc_send = set(re.findall(r"mainWindow\.webContents\.send\(\s*['\"]([a-zA-Z:_-]+)['\"]", main_text))
all_main_channels = ipc_channels | ipc_send

# === 3. RENDERER ===
renderer_text = ""
for ts in RENDERER_DIR.rglob("*.ts"):
    if ".test." in ts.name:
        continue
    renderer_text += read(ts) + "\n"
for tx in RENDERER_DIR.rglob("*.tsx"):
    if ".test." in tx.name:
        continue
    renderer_text += read(tx) + "\n"

# 3a. window.api.X.Y 或 window.api.X 调用
renderer_calls = set()
for m in re.finditer(r"window\.api\.([a-zA-Z]+(?:\.[a-zA-Z]+)?)", renderer_text):
    renderer_calls.add(m.group(1))
# 3b. window.api.on('event', cb) — 单独算
renderer_on_events = set()
for m in re.finditer(r"window\.api\.on\(['\"]([a-zA-Z:_-]+)['\"]", renderer_text):
    renderer_on_events.add(m.group(1))

# === 4. 对齐分析 ===
print("=" * 70)
print(f"preload channels: {len(preload_channels)}")
print(f"preload API methods (含 namespace.X): {len(preload_api_methods)}")
print(f"IPC handle channels: {len(ipc_channels)}")
print(f"IPC send channels: {len(ipc_send)}")
print(f"renderer 调用 window.api.* (含 namespace.method): {len(renderer_calls)}")
print(f"renderer 监听 events: {len(renderer_on_events)}")
print()

# a. preload 暴露但 IPC 没注册 (P0 - 调必失败)
missing_handler = preload_channels - all_main_channels
print(f"🔴 P0a: preload 暴露但 IPC 没注册 ({len(missing_handler)} 个)")
for c in sorted(missing_handler):
    print(f"   - {c}")
print()

# b. IPC 注册但 preload 没暴露 (P1 - 注册了但 renderer 调不到)
not_exposed = all_main_channels - preload_channels
print(f"🟠 P1b: IPC 注册但 preload 没暴露 ({len(not_exposed)} 个)")
for c in sorted(not_exposed):
    print(f"   - {c}")
print()

# c. preload/IPC 都注册但 renderer 没用 (P1 - 死 API)
# 思路: preload namespace.X 被 renderer 调用 → 看 namespace 和 method 是否匹配
renderer_namespaces = set()
renderer_methods_in_namespace = {}  # namespace -> set of methods
for call in renderer_calls:
    if "." in call:
        ns, m = call.split(".", 1)
        renderer_namespaces.add(ns)
        renderer_methods_in_namespace.setdefault(ns, set()).add(m)
    else:
        renderer_namespaces.add(call)  # flat method (没 namespace)

used_api = set()
for api_name in preload_api_methods:
    if "." in api_name:
        ns, m = api_name.split(".", 1)
        if m in renderer_methods_in_namespace.get(ns, set()):
            used_api.add(api_name)
    else:
        # flat: apiName 可能是 namespace 也可能是 method
        if api_name in renderer_namespaces or api_name in renderer_calls:
            used_api.add(api_name)

unused_api = preload_api_methods - used_api
# 排除 onXxx (事件回调)
unused_api = {m for m in unused_api if not m.split(".")[-1].startswith("on")}
print(f"🟡 P1c: preload API renderer 未调用 ({len(unused_api)} 个) — 疑似死 API")
for m in sorted(unused_api):
    print(f"   - {m}")
print()

# d. renderer 调了但 preload 没暴露 (P0 - 调必失败)
# namespace 被 renderer 调用但 preload 里没有这个 namespace
preload_namespaces = set()
for m in re.finditer(r"const\s+([a-zA-Z][a-zA-Z0-9]*)\s*=\s*\{", preload_text):
    preload_namespaces.add(m.group(1))
# api = { namespace, ... } 也算
for m in re.finditer(r"^\s+([a-zA-Z][a-zA-Z0-9]*)\s*:\s*[a-zA-Z][a-zA-Z0-9]*\s*$", preload_text, re.MULTILINE):
    if m.group(1) in preload_namespaces:
        pass  # 在 顶层 api = { namespace, ... } 块里
missing_namespace = renderer_namespaces - preload_namespaces
print(f"🔴 P0d: renderer 用到的 namespace preload 没暴露 ({len(missing_namespace)} 个)")
for n in sorted(missing_namespace):
    print(f"   - {n}")
print()

# === 5. 汇总 ===
print("=" * 70)
print("汇总:")
print(f"  P0a (preload→IPC 缺失): {len(missing_handler)} 个 — 真实 bug, 调必失败")
print(f"  P1b (IPC→preload 缺失): {len(not_exposed)} 个 — 死 IPC (注册了但调不到)")
print(f"  P1c (preload→renderer 缺失): {len(unused_api)} 个 — 死 API (暴露了但没人用)")
print(f"  P0d (renderer→preload 缺失): {len(missing_namespace)} 个 — 真实 bug, 调必失败")
