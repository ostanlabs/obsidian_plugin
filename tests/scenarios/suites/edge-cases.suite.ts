/**
 * Edge Cases Test Suite
 *
 * Tests for edge cases and boundary conditions.
 */

import { defineSuite } from '../../framework';
// Entity IDs
import EC001 from '../edge-cases/EC-001';
import EC002 from '../edge-cases/EC-002';
import EC003 from '../edge-cases/EC-003';
// Parent/Child
import EC010 from '../edge-cases/EC-010';
import EC011 from '../edge-cases/EC-011';
import EC012 from '../edge-cases/EC-012';
import EC013 from '../edge-cases/EC-013';
// Dependencies
import EC020 from '../edge-cases/EC-020';
import EC021 from '../edge-cases/EC-021';
import EC022 from '../edge-cases/EC-022';
import EC023 from '../edge-cases/EC-023';
import EC024 from '../edge-cases/EC-024';
import EC025 from '../edge-cases/EC-025';
// Workstreams
import EC030 from '../edge-cases/EC-030';
import EC031 from '../edge-cases/EC-031';
import EC032 from '../edge-cases/EC-032';
import EC033 from '../edge-cases/EC-033';
// Canvas
import EC040 from '../edge-cases/EC-040';
import EC041 from '../edge-cases/EC-041';
import EC042 from '../edge-cases/EC-042';
import EC043 from '../edge-cases/EC-043';
import EC044 from '../edge-cases/EC-044';
// Archive
import EC050 from '../edge-cases/EC-050';
import EC051 from '../edge-cases/EC-051';
import EC052 from '../edge-cases/EC-052';
import EC053 from '../edge-cases/EC-053';
// Frontmatter
import EC060 from '../edge-cases/EC-060';
import EC061 from '../edge-cases/EC-061';
import EC062 from '../edge-cases/EC-062';
import EC063 from '../edge-cases/EC-063';
import EC064 from '../edge-cases/EC-064';
// Visibility
import EC070 from '../edge-cases/EC-070';
import EC071 from '../edge-cases/EC-071';
// Notion
import EC080 from '../edge-cases/EC-080';
import EC081 from '../edge-cases/EC-081';
import EC082 from '../edge-cases/EC-082';

export default defineSuite({
  name: 'Edge Cases',
  description: 'Edge cases for IDs, parent/child, dependencies, workstreams, canvas, archive, frontmatter, visibility, Notion',
  scenarios: [
    // Entity IDs
    EC001, EC002, EC003,
    // Parent/Child
    EC010, EC011, EC012, EC013,
    // Dependencies
    EC020, EC021, EC022, EC023, EC024, EC025,
    // Workstreams
    EC030, EC031, EC032, EC033,
    // Canvas
    EC040, EC041, EC042, EC043, EC044,
    // Archive
    EC050, EC051, EC052, EC053,
    // Frontmatter
    EC060, EC061, EC062, EC063, EC064,
    // Visibility
    EC070, EC071,
    // Notion
    EC080, EC081, EC082,
  ],
});

