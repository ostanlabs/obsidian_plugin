/**
 * Entity Creation Test Suite
 * 
 * Tests for creating various entity types through the plugin.
 */

import { defineSuite } from '../../framework';
import SC001 from '../entity-creation/SC-001';
import SC002 from '../entity-creation/SC-002';

export default defineSuite({
  name: 'Entity Creation',
  fixture: 'base-vault',
  scenarios: [
    SC001,
    SC002,
  ],
});

