import type { Line } from '../ui/ui';

export enum Stage {
  Intro = 0,
  MeetFinn = 1,
  Collect = 2,
  BuildBridge = 3,
  ToWorkshop = 4,
  Gears = 5,
  Turbine = 6,
  Panel = 7,
  Lens = 8,
  Finale = 9,
  Free = 10,
}

export const OBJECTIVES: Record<number, { text: string; icon: string; sub?: string }> = {
  [Stage.MeetFinn]: { text: 'Say hello to Captain Finn', icon: 'talk', sub: 'He is waiting by the jetty' },
  [Stage.Collect]: { text: 'Find the 3 bundles of bridge parts', icon: 'posts' },
  [Stage.BuildBridge]: { text: 'Fix the broken bridge', icon: 'bridge', sub: 'Follow the path north to the stream' },
  [Stage.ToWorkshop]: { text: "Visit Professor Cogsworth's workshop", icon: 'gear', sub: 'Cross your new bridge!' },
  [Stage.Gears]: { text: 'Fix the gear machine', icon: 'gear', sub: 'It is at the back of the workshop' },
  [Stage.Turbine]: { text: 'Turn the wind turbine into the wind', icon: 'wind', sub: 'Up on the hill – check the windsock!' },
  [Stage.Panel]: { text: 'Connect the power panel', icon: 'bolt', sub: "Next to the keeper's cottage" },
  [Stage.Lens]: { text: 'Take the Sun Lens to the lighthouse', icon: 'lens', sub: 'Go to the lighthouse door' },
  [Stage.Free]: { text: 'Explore Mersey Isle!', icon: 'starfish', sub: 'Can you find every starfish?' },
};

export const PIP_INTRO: Line[] = [
  { who: 'pip', text: "Ahoy, explorer! I'm Pip – harbour helper, puffin, and part-time hat model." },
  { who: 'pip', text: 'Thank goodness you came! The island needs a hero. Captain Finn is just up the jetty – let\'s go and say hello!' },
];

export const FINN_INTRO: Line[] = [
  { who: 'finn', text: "Well, shiver my seashells – a real explorer! Welcome to Mersey Isle." },
  { who: 'finn', text: "Last night's storm knocked out our lighthouse. Without its light, boats can't find a safe way past the rocks." },
  { who: 'finn', text: "And out there is little Bobbin, our animal rescue boat. She's carrying a seal pup and three ducklings she saved from the storm!" },
  { who: 'finn', text: "To fix the lighthouse we need Professor Cogsworth. He has the lighthouse's special Sun Lens in his workshop…" },
  { who: 'finn', text: "…but the storm smashed the bridge to his workshop, and scattered the bridge parts all around the village." },
  { who: 'finn', text: 'Can you find the 3 bundles of bridge parts and rebuild the bridge? Pip will show you the way!' },
  { who: 'pip', text: "Leave it to us, Captain! Follow the yellow markers, explorer – they show where to go next." },
];

export const FINN_LATER: Record<number, Line[]> = {
  [Stage.Collect]: [{ who: 'finn', text: 'Look for the glittering bundles of wood around the village. One is next to the old boat shed, I think!' }],
  [Stage.BuildBridge]: [{ who: 'finn', text: 'You found them all! Now head up the path to the stream and build that bridge.' }],
  [Stage.ToWorkshop]: [{ who: 'finn', text: 'A new bridge! Splendid work. The Professor will be so pleased.' }],
};

export const BRIDGE_DONE: Line[] = [
  { who: 'prof', text: "Great gears and galloping gadgets! A brand new bridge! And such clever building!" },
  { who: 'prof', text: "Those triangles will keep it strong for a hundred years. Come along to my workshop – I need your help again!" },
];

export const PROF_INTRO: Line[] = [
  { who: 'prof', text: "Welcome to my workshop! Mind the spanners – they bite. Only joking. Mostly." },
  { who: 'prof', text: "The lighthouse's Sun Lens is locked safely inside my gear vault. But the storm shook all the gears loose!" },
  { who: 'prof', text: 'The water wheel turns the first gear. We need to pass that turning all the way across to the vault gear.' },
  { who: 'prof', text: 'But be careful – the vault only opens if its gear spins the right way, like the green arrow shows. Can you fix it?' },
];

export const GEARS_DONE: Line[] = [
  { who: 'prof', text: 'Hooray! The Sun Lens! You understood the secret of gears: neighbours always spin opposite ways!' },
  { who: 'prof', text: "Now, the lighthouse needs electricity too. The storm twisted our wind turbine round, and jumbled the power panel." },
  { who: 'prof', text: 'Head up the hill to the turbine first. A turbine catches the most wind when it faces INTO the wind!' },
  { who: 'pip', text: "Up the hill we go! I'll carry the lens. Just kidding – it's heavier than me." },
];

export const TURBINE_DONE: Line[] = [
  { who: 'pip', text: 'Look at it spin! The wind pushes the blades, and the turbine turns that movement into electricity!' },
  { who: 'pip', text: "The power runs along the cables to the keeper's cottage. Let's fix the power panel next to it!" },
];

export const PANEL_DONE: Line[] = [
  { who: 'pip', text: "100% power! Wind power AND the solar battery that soaked up sunshine all day! We're nearly there!" },
  { who: 'pip', text: "Now let's take the Sun Lens up to the top of the lighthouse. Quick – Bobbin is waiting!" },
];

export const HINTS: Record<number, string[]> = {
  [Stage.MeetFinn]: ['Captain Finn is the friendly sailor at the end of the jetty. Walk up to him and press <b>E</b> (or the orange button).'],
  [Stage.Collect]: [
    'Follow the yellow marker to find a bundle. Just walk into it to pick it up!',
    'One bundle is by the boat shed, one is on the sandy beach, and one is in the meadow near the stream.',
  ],
  [Stage.BuildBridge]: ['Follow the path north out of the village. The broken bridge is over the stream.'],
  [Stage.ToWorkshop]: ['Cross the bridge and turn left – the workshop has a big gear on the front!'],
  [Stage.Gears]: ['Walk inside the workshop to the board at the back wall and press <b>E</b>.'],
  [Stage.Turbine]: [
    'The turbine is on top of the hill. Press <b>E</b> next to it to turn it.',
    'See the stripy windsock? Its big open end points the way the wind comes FROM. Make the turbine face the same way!',
  ],
  [Stage.Panel]: ["The power panel stands next to the keeper's cottage, near the lighthouse."],
  [Stage.Lens]: ['Walk to the red door at the bottom of the lighthouse and press <b>E</b>.'],
  [Stage.Free]: ['There are 12 starfish hidden around the island. Some are on beaches, some on hills!'],
};

export const QUIPS = {
  jump: ['Wheee! Nice jump!', 'Boing! You jump almost as well as a puffin.', 'Higher! Higher! …OK, that was quite high.'],
  starfish: [
    'A starfish! Did you know they have no brain? Lucky things – no homework!',
    'Another starfish! Starfish can grow back their arms. Handy!',
    'Ooh, a sparkly starfish!',
    'Starfish have an eye at the end of each arm. Wink wink!',
  ],
  idle: [
    "Puffins can flap their wings 400 times a minute. I prefer 'flap when necessary'.",
    'Smell that sea air! Mmm… fishy.',
    'Did you know a lighthouse light can be seen more than 30 kilometres away?',
    'I once tried to carry a crab. It did NOT agree.',
  ],
  sheep: ['Baa! Those sheep keep the grass nice and short.'],
};

export const CAPTIONS = [
  "Mersey Isle sits just off Liverpool's busy waterfront…",
  'Last night, a great storm swept across the sea – and the old lighthouse went dark.',
  'Out at sea, the little rescue boat Bobbin is waiting with a seal pup and three ducklings she saved.',
  "Without the lighthouse, Bobbin can't find a safe way home past the rocks.",
  'But help is on the way…',
];
