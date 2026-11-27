import './styles.css';
import { VanillaMount } from '../../lib/VanillaMount';
import { mountCalibration } from './engine.js';
export default function Calibration() {
  return <VanillaMount mount={mountCalibration} />;
}
