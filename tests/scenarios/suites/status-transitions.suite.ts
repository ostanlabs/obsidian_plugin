import { defineSuite } from '../../framework';
import ST001 from '../status-transitions/ST-001';
import ST002 from '../status-transitions/ST-002';
import ST003 from '../status-transitions/ST-003';
import ST004 from '../status-transitions/ST-004';

export default defineSuite({
  name: 'Status Transitions',
  description: 'Status flow validation, parent/child status, blocking dependencies',
  scenarios: [
    ST001,
    ST002,
    ST003,
    ST004,
  ],
});

