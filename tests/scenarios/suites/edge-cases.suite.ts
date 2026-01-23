/**
 * Edge Cases Test Suite
 * 
 * Tests for edge cases and boundary conditions.
 */

import { defineSuite } from '../../framework';
import EC020 from '../edge-cases/EC-020';

export default defineSuite({
  name: 'Edge Cases',
  fixture: 'base-vault',
  scenarios: [
    EC020,
  ],
});

