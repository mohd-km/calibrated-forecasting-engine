import './styles.css';
import { VanillaMount } from '../../lib/VanillaMount';
import { mountBayes } from './bayes.js';
export default function Bayes() {
  return <VanillaMount mount={mountBayes} />;
}
