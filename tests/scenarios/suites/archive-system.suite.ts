import { defineSuite } from '../../framework';
import SC040 from '../archive-system/SC-040';
import SC041 from '../archive-system/SC-041';
import SC042 from '../archive-system/SC-042';
import SC043 from '../archive-system/SC-043';

export default defineSuite({
  name: 'Archive System',
  description: 'Archiving entities, folder structure, restore functionality',
  scenarios: [
    SC040,
    SC041,
    SC042,
    SC043,
  ],
});

