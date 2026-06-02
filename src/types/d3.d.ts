// D3 simulation event declarations
// Fixes @typescript-eslint/no-unsafe-member-access on d.x/d.y/d.fx/d.fy in simulation callbacks

declare module 'd3' {
  export namespace simulation {
    interface SimulationEvent {
      type: string
      sourceEvent?: Event
      active: boolean
      x?: number
      y?: number
    }

    interface DragEvent {
      type: string
      sourceEvent: Event
      active: boolean
      x: number
      y: number
    }

    interface NodeDatum {
      x?: number
      y?: number
      vx?: number
      vy?: number
      fx?: number | null
      fy?: number | null
      index?: number
      [key: string]: unknown
    }
  }
}
