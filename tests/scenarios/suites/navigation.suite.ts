import { defineSuite } from '../../framework';
import SC050 from '../navigation/SC-050';
import SC051 from '../navigation/SC-051';
import SC052 from '../navigation/SC-052';
import SC053 from '../navigation/SC-053';
import SC054 from '../navigation/SC-054';

export default defineSuite({
  name: 'Navigation',
  description: 'Navigate between entities via parent/child/dependency links',
  scenarios: [
    SC050,
    SC051,
    SC052,
    SC053,
    SC054,
  ],
});

