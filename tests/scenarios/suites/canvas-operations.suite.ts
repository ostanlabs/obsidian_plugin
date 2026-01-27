import { defineSuite } from '../../framework';
import SC030 from '../canvas-operations/SC-030';
import SC031 from '../canvas-operations/SC-031';
import SC032 from '../canvas-operations/SC-032';
import SC033 from '../canvas-operations/SC-033';

export default defineSuite({
  name: 'Canvas Operations',
  description: 'Populate, reposition, visibility toggles, visual styling',
  scenarios: [
    SC030,
    SC031,
    SC032,
    SC033,
  ],
});

