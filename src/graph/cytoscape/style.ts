import type cytoscape from 'cytoscape'
import { colours, fonts } from '../../theme'
import { DIAMETER, PILL_H } from '../layout'

// Horizontal first with the turn at 100%: Cytoscape falls back to an L-shape, sideways out of the source
// and then straight along the target's lane.
const elbow = {
  'curve-style': 'round-taxi',
  'taxi-direction': 'horizontal',
  'taxi-turn': '100%',
  'taxi-radius': 16,
} as const

export const stylesheet: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: { 'overlay-opacity': 0, 'events': 'no' },
  },
  {
    selector: 'node.commit',
    style: {
      events: 'yes',
      shape: 'ellipse',
      width: DIAMETER,
      height: DIAMETER,
      'background-color': colours.surface,
      'border-width': 3,
      'border-color': 'data(colour)',
      label: 'data(id)',
      'font-family': fonts.mono,
      'font-size': 10.5,
      color: colours.ink,
      'text-valign': 'center',
      'text-halign': 'center',
    },
  },
  {
    selector: 'node.commit.head',
    style: {
      'border-width': 4,
      'underlay-color': 'data(colour)',
      'underlay-opacity': 0.22,
      'underlay-padding': 7,
      'underlay-shape': 'ellipse',
    },
  },
  { selector: 'node.commit.revert', style: { 'border-style': 'dashed' } },
  { selector: 'node.commit:active', style: { 'border-width': 6 } },
  {
    selector: 'node.label',
    style: {
      width: 1,
      height: 1,
      'background-opacity': 0,
      label: 'data(text)',
      'text-halign': 'right',
      'text-valign': 'center',
      'font-family': fonts.sans,
      'font-size': 12,
      'font-weight': 500,
      color: colours.muted,
    },
  },
  {
    selector: 'node.pill',
    style: {
      shape: 'round-rectangle',
      width: 'data(width)',
      height: PILL_H,
      'background-color': 'data(colour)',
      label: 'data(text)',
      color: colours.surface,
      'font-family': fonts.sans,
      'font-size': 11,
      'font-weight': 600,
      'text-valign': 'center',
      'text-halign': 'center',
    },
  },
  {
    selector: 'node.pill.tag',
    style: {
      'background-color': colours.surface,
      'border-width': 1.5,
      'border-color': 'data(colour)',
      color: colours.ink,
    },
  },
  {
    // origin/<b>: your last known view of the server, drawn as an outline in the branch's colour
    selector: 'node.pill.remote',
    style: {
      'background-color': colours.surface,
      'border-width': 1.5,
      'border-style': 'dashed',
      'border-color': 'data(colour)',
      color: 'data(colour)',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 3,
      'line-color': 'data(colour)',
      'curve-style': 'straight',
      'overlay-opacity': 0,
      events: 'no',
    },
  },
  { selector: 'edge.fork, edge.merge', style: elbow },
]
