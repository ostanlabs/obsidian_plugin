import { defineSuite } from '../../framework';
import ON001 from '../onboarding/ON-001';
import ON002 from '../onboarding/ON-002';
import ON003 from '../onboarding/ON-003';
import ON004 from '../onboarding/ON-004';
import ON005 from '../onboarding/ON-005';
import ON006 from '../onboarding/ON-006';
import ON007 from '../onboarding/ON-007';
import ON008 from '../onboarding/ON-008';
import ON009 from '../onboarding/ON-009';
import ON010 from '../onboarding/ON-010';

export default defineSuite({
  name: 'Onboarding',
  description: 'First-time setup, folder structure, canvas creation, Notion integration',
  scenarios: [
    ON001,
    ON002,
    ON003,
    ON004,
    ON005,
    ON006,
    ON007,
    ON008,
    ON009,
    ON010,
  ],
});

