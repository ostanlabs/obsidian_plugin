import { defineSuite } from '../../framework';
import SC020 from '../dependency-management/SC-020';
import SC021 from '../dependency-management/SC-021';
import SC022 from '../dependency-management/SC-022';
import SC023 from '../dependency-management/SC-023';
import SC024 from '../dependency-management/SC-024';

export default defineSuite({
  name: 'Dependency Management',
  description: 'Dependency chains, cross-workstream dependencies, circular detection',
  scenarios: [
    SC020,
    SC021,
    SC022,
    SC023,
    SC024,
  ],
});

