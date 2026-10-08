import cytoscape from 'cytoscape'
import type { Effect, RepoState } from '../../engine'
import { type GraphLayout, layout } from '../layout'
import type { GraphRenderer, RendererOptions } from '../renderer'
import { stylesheet } from './style'

const DURATION = 380
const FADED = 0.28
const PADDING = 48

type Position = { x: number; y: number }

export class CytoscapeRenderer implements GraphRenderer {
  private cy: cytoscape.Core | null = null
  private observer: ResizeObserver | null = null
  private bounds: GraphLayout['bounds'] | null = null
  private userMoved = false
  private readonly opts: RendererOptions

  constructor(opts: RendererOptions = {}) {
    this.opts = opts
  }

  mount(el: HTMLElement) {
    const cy = cytoscape({
      container: el,
      style: stylesheet,
      minZoom: 0.25,
      maxZoom: 2.5,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autounselectify: true,
      userPanningEnabled: this.opts.interactive !== false,
      userZoomingEnabled: this.opts.interactive !== false,
    })
    cy.on('tap', 'node.commit', (e) => this.opts.onCommitClick?.(e.target.id()))
    cy.on('mouseover', 'node.commit', () => (el.style.cursor = 'pointer'))
    cy.on('mouseout', 'node.commit', () => (el.style.cursor = ''))
    cy.on('dragpan scrollzoom pinchzoom', () => (this.userMoved = true))

    this.observer = new ResizeObserver(() => {
      cy.resize()
      if (!this.userMoved && this.bounds) this.viewTo(this.bounds, false)
    })
    this.observer.observe(el)
    // Canvas text is drawn once; redraw when the web fonts arrive.
    document.fonts?.ready.then(() => this.cy?.style().update())
    this.cy = cy
  }

  update(state: RepoState, effects: Effect[] = []): Promise<void> {
    const cy = this.cy
    if (!cy) return Promise.resolve()

    const model = layout(state)
    const instant = cy.elements().empty()
    const wanted = new Set<string>()

    // Where should a brand-new element appear from? Copies fly from their original; new commits rise from their parent.
    const copiedFrom = new Map<string, string>()
    for (const e of effects) if (e.type === 'copy') copiedFrom.set(e.to, e.from)
    const currentPos = (id: string | null | undefined): Position | undefined => {
      const n = id ? cy.getElementById(id) : null
      return n && n.nonempty() ? { ...n.position() } : undefined
    }

    const upsertNode = (id: string, classes: string, data: object, pos: Position, opacity: number, from?: Position) => {
      wanted.add(id)
      let n = cy.getElementById(id)
      if (n.empty()) {
        n = cy.add({ group: 'nodes', data: { id, ...data }, classes, position: { ...(from ?? pos) } })
        n.style('opacity', 0)
      } else {
        n.data(data)
        n.classes(classes)
      }
      if (instant) {
        n.position(pos)
        n.style('opacity', opacity)
      } else {
        n.stop(true, false)
        n.animate({ position: pos, style: { opacity } }, { duration: DURATION, easing: 'ease-in-out-cubic' })
      }
    }

    for (const c of model.commits) {
      const from = currentPos(copiedFrom.get(c.sha)) ?? currentPos(c.firstParent)
      const classes = ['commit', c.head && 'head', c.revert && 'revert'].filter(Boolean).join(' ')
      upsertNode(c.sha, classes, { colour: c.colour }, { x: c.x, y: c.y }, c.reachable ? 1 : FADED, from)
    }
    for (const l of model.labels) {
      upsertNode(l.id, 'label', { text: l.text }, { x: l.x, y: l.y }, l.reachable ? 1 : FADED)
    }
    for (const p of model.pills) {
      upsertNode(p.id, `pill ${p.kind}`, { text: p.text, width: p.width, colour: p.colour }, { x: p.x, y: p.y }, 1)
    }

    for (const e of model.edges) {
      wanted.add(e.id)
      let edge = cy.getElementById(e.id)
      if (edge.empty()) {
        edge = cy.add({ group: 'edges', data: { id: e.id, source: e.source, target: e.target, colour: e.colour }, classes: e.kind })
        edge.style('opacity', 0)
      } else {
        edge.data('colour', e.colour)
        edge.classes(e.kind)
      }
      const opacity = e.reachable ? 1 : FADED
      if (instant) edge.style('opacity', opacity)
      else edge.stop(true, false).animate({ style: { opacity } }, { duration: DURATION })
    }

    cy.elements()
      .filter((el) => !wanted.has(el.id()))
      .forEach((el) => {
        if (instant) el.remove()
        else el.stop(true, false).animate({ style: { opacity: 0 } }, { duration: DURATION / 2, complete: () => el.remove() })
      })

    this.bounds = model.bounds
    if (instant) {
      this.userMoved = false
      this.viewTo(model.bounds, false)
    } else if (!this.contains(model.bounds)) {
      this.viewTo(model.bounds, true)
    }

    return new Promise((resolve) => setTimeout(resolve, instant ? 0 : DURATION))
  }

  fit() {
    this.userMoved = false
    if (this.bounds) this.viewTo(this.bounds, true)
  }

  /** Forget everything drawn so the next update renders instantly (e.g. after resetting a level). */
  clear() {
    this.cy?.elements().remove()
  }

  destroy() {
    this.observer?.disconnect()
    this.cy?.destroy()
    this.cy = null
  }

  private contains(b: GraphLayout['bounds']) {
    const e = this.cy!.extent()
    const m = 16 // room for the HEAD halo
    return b.x1 - m >= e.x1 && b.x2 + m <= e.x2 && b.y1 - m >= e.y1 && b.y2 + m <= e.y2
  }

  /**
   * Zoom so the whole graph fills the panel, and centre it. Small graphs don't blow up to absurd sizes: the
   * maximum zoom scales with the panel (a bigger panel allows a bigger graph).
   */
  private viewTo(b: GraphLayout['bounds'], animate: boolean) {
    const cy = this.cy!
    const w = cy.width()
    const h = cy.height()
    if (!w || !h) return
    const fitZoom = Math.min(w / (b.x2 - b.x1 + 2 * PADDING), h / (b.y2 - b.y1 + 2 * PADDING))
    const cap = Math.min(2, Math.max(0.9, Math.min(w, h) / 420))
    const zoom = Math.max(cy.minZoom(), Math.min(fitZoom, cap))
    const pan = { x: w / 2 - (zoom * (b.x1 + b.x2)) / 2, y: h / 2 - (zoom * (b.y1 + b.y2)) / 2 }
    if (animate) cy.stop(true, false).animate({ zoom, pan }, { duration: DURATION, easing: 'ease-in-out-cubic' })
    else cy.viewport({ zoom, pan })
  }
}
