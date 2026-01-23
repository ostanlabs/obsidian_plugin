import { defineSuite } from '../../framework';
import SC010 from '../hierarchy/SC-010';
import SC011 from '../hierarchy/SC-011';
import SC012 from '../hierarchy/SC-012';

export default defineSuite({
  name: 'Hierarchy Management',
  description: 'Parent/child relationships, reparenting, orphan handling',
  scenarios: [
    SC010,
    SC011,
    SC012,
  ],
});

