export interface URLFetchResult {
  title: string
  content: string
  author?: string
  date?: string
  url: string
  source: 'jina' | 'direct' | 'wechat' | 'youtube' | 'twitter' | 'github' | 'reddit'
}
