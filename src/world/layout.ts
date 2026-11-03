// World layout: all landmark positions in one place. x = east, z = north, y = up.
import { smoothPolyline } from '../core/noise';

export type P2 = [number, number];

export const ISLAND = { cx: 5, cz: 6, rx: 112, rz: 86 };

export const STREAM_RAW: P2[] = [
  [-76, 19],
  [-62, 15],
  [-46, 9],
  [-30, 4.5],
  [-14, 1.5],
  [0, 0],
  [14, -2],
  [30, -5],
  [48, -3],
  [66, -8],
  [86, -12],
  [104, -14],
  [124, -16],
];
export const STREAM: P2[] = smoothPolyline(STREAM_RAW, 6);

export const BRIDGE = { x: 0, z: 0, deckY: 3.75, halfLen: 7.6, halfW: 1.45, bankY: 3.45 };

export const PATHS: P2[][] = [
  // jetty → village square → bridge
  [
    [10, -60],
    [9, -52],
    [8.5, -49],
    [5.5, -41],
    [3.5, -30],
    [1.5, -19],
    [0.4, -11],
    [0, -7.4],
  ],
  // bridge → workshop
  [
    [0, 7.4],
    [-3, 11],
    [-10, 14.5],
    [-17, 17],
  ],
  // bridge → turbine hill → lighthouse
  [
    [0, 7.4],
    [4, 14],
    [9, 25],
    [13, 36],
    [17, 45],
    [23, 52],
    [32, 60],
    [41, 68],
    [48, 75],
    [53, 79],
  ],
  // village street
  [
    [-38, -42],
    [-24, -43],
    [-10, -42.5],
    [5.5, -41],
    [20, -41.5],
    [34, -43],
    [46, -46],
  ],
  // to the beach
  [
    [34, -43],
    [40, -49],
    [44, -54],
  ],
];

export const VILLAGE_SQUARE: P2 = [5, -40];

export const JETTY = { x: 10, z0: -61.5, z1: -85, halfW: 1.6, y: 1.35 };
export const QUAY = { x0: -27, x1: 34, z: -61.2 };

export const WORKSHOP = { x: -27, z: 17.5, yaw: Math.PI / 2, w: 13, d: 10 };
export const WATERWHEEL = { x: -27, z: 7.2 };
export const TURBINE = { x: 20, z: 50 };
export const WINDSOCK = { x: 25.5, z: 46.5 };
export const LIGHTHOUSE = { x: 62, z: 88 };
export const COTTAGE = { x: 51, z: 82, yaw: -Math.PI * 0.8 };
export const PANEL = { x: 52.2, z: 77.4 };

export const FINN_POS: P2 = [8.0, -59.0];
export const PROF_POS: P2 = [-17.5, 19.5];

export const PLAYER_START = { x: 10, z: -80, yaw: 0 };

export const BUNDLES: { id: 'posts' | 'beams' | 'braces'; x: number; z: number; name: string }[] = [
  { id: 'posts', x: -26.2, z: -49.5, name: 'Bridge Posts' },
  { id: 'beams', x: 41, z: -53.5, name: 'Long Beams' },
  { id: 'braces', x: 24, z: -16, name: 'Brace Kit' },
];

export const STARFISH: P2[] = [
  [-20, -59],
  [28, -59.5],
  [52, -50],
  [-40, -30],
  [30, -26],
  [-6, -24],
  [-44, 22],
  [-8, 34],
  [36, 34],
  [70, 70],
  [40, 88],
  [-30, 40],
];

export const RESCUE_BOAT_START = { x: 118, z: 122 };
export const RESCUE_PATH: P2[] = [
  [118, 122],
  [132, 80],
  [136, 20],
  [128, -40],
  [92, -82],
  [46, -92],
  [18, -90],
  [13.6, -82],
];

export interface HouseDef {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  floors: number;
  wall: string;
  roof: string;
  trim: string;
  door: string;
  kind?: 'house' | 'shop' | 'harbour' | 'shed' | 'cafe';
}

// yaw: the direction the front door faces (0 = +z / north)
const S = Math.PI; // facing south
export const HOUSES: HouseDef[] = [
  { x: -33, z: -32.5, yaw: S, w: 7, d: 6, floors: 2, wall: '#f3a6a0', roof: '#5c6f8f', trim: '#ffffff', door: '#3c7fb0' },
  { x: -24.5, z: -32, yaw: S, w: 7.5, d: 6, floors: 2, wall: '#ffd77a', roof: '#b9584a', trim: '#ffffff', door: '#3f8f5a' },
  { x: -15.5, z: -31.5, yaw: S, w: 7, d: 6.5, floors: 3, wall: '#8fd0e8', roof: '#5a5d78', trim: '#ffffff', door: '#d24f4f', kind: 'shop' },
  { x: -6.5, z: -32, yaw: S, w: 7, d: 6, floors: 2, wall: '#c8e39a', roof: '#a8574a', trim: '#fff8e8', door: '#6a4fb0' },
  { x: 15.5, z: -32, yaw: S, w: 8, d: 6.5, floors: 2, wall: '#f7c39a', roof: '#4f6a86', trim: '#ffffff', door: '#2f6fa8', kind: 'cafe' },
  { x: 25, z: -32.5, yaw: S, w: 7, d: 6, floors: 3, wall: '#e9b6e0', roof: '#5c6f8f', trim: '#ffffff', door: '#e0a03a' },
  { x: 34, z: -34, yaw: S + 0.18, w: 7, d: 6, floors: 2, wall: '#ffeaa8', roof: '#b45a4b', trim: '#ffffff', door: '#3c8f8f' },
  { x: -33, z: -50.5, yaw: 0, w: 9, d: 7, floors: 1, wall: '#c98d5a', roof: '#7a5c48', trim: '#efe2c6', door: '#6b4a32', kind: 'shed' },
  { x: -20.5, z: -51, yaw: 0, w: 7, d: 6, floors: 2, wall: '#a8d8c8', roof: '#b9584a', trim: '#ffffff', door: '#c74f6a' },
  { x: 24, z: -51, yaw: 0, w: 9, d: 7, floors: 2, wall: '#f1f0ea', roof: '#2f4f7a', trim: '#2f4f7a', door: '#2f4f7a', kind: 'harbour' },
];

export const TREE_AVOID: { x: number; z: number; r: number }[] = [
  { x: WORKSHOP.x, z: WORKSHOP.z, r: 12 },
  { x: TURBINE.x, z: TURBINE.z, r: 8 },
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 10 },
  { x: COTTAGE.x, z: COTTAGE.z, r: 9 },
  { x: 0, z: 0, r: 12 },
  { x: VILLAGE_SQUARE[0], z: VILLAGE_SQUARE[1], r: 9 },
];
