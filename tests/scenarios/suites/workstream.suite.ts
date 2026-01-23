import { defineSuite } from '../../framework';
import WS001 from '../workstream/WS-001';
import WS002 from '../workstream/WS-002';
import WS003 from '../workstream/WS-003';

export default defineSuite({
  name: 'Workstream',
  description: 'Single/multi workstream layouts, cross-workstream dependencies',
  scenarios: [
    WS001,
    WS002,
    WS003,
  ],
});

