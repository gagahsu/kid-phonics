import { Composition } from 'remotion';
import { Reel, TOTAL } from './Reel';
import { Reel2, TOTAL2 } from './Reel2';
import { Reel3, TOTAL3 } from './Reel3';

// url: site address shown on the end card (https://gagahsu.github.io/kid-phonics/, scheme dropped to read cleaner)
const url = 'gagahsu.github.io/kid-phonics';
export const Root = () => (
  <>
    <Composition id="Reel" component={Reel} durationInFrames={TOTAL} fps={30} width={1080} height={1920} defaultProps={{ url }} />
    <Composition id="Reel2" component={Reel2} durationInFrames={TOTAL2} fps={30} width={1080} height={1920} defaultProps={{ url }} />
    <Composition id="Reel3" component={Reel3} durationInFrames={TOTAL3} fps={30} width={1080} height={1920} defaultProps={{ url }} />
  </>
);
