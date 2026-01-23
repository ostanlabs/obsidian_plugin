import { defineSuite } from '../../framework';
import SC060 from '../notion-sync/SC-060';
import SC061 from '../notion-sync/SC-061';
import SC062 from '../notion-sync/SC-062';
import SC063 from '../notion-sync/SC-063';

export default defineSuite({
  name: 'Notion Sync',
  description: 'Notion integration, sync, pull, conflict resolution',
  scenarios: [
    SC060,
    SC061,
    SC062,
    SC063,
  ],
});

