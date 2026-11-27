import './styles.css';
import { VanillaMount } from '../../lib/VanillaMount';
import { mountFatTails } from './fatTails.js';
export default function FatTails() {
  return <VanillaMount mount={mountFatTails} />;
}
