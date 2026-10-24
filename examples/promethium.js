import { writeFile } from 'node:fs/promises';
import { calculateProduction, calculateBarrelTransport, getRecipeDetails } from '../src/calculator.js';

let originalQuestion;
try {
  originalQuestion = await calculateProduction({ targets: { '黑瓶': 120 }, location: '地星' });
} catch (error) {
  originalQuestion = { error: { code: error.code, message: error.message, details: error.details } };
}
// Alternative explicitly changes production sites; it is not a claim that
// the original Nauvis plan can be built. These calls demonstrate tool use.
const scienceOnPlatform = await calculateProduction({
  targets: { '黑瓶': 120 }, location: '太空平台', recipeIds: ['promethium-science-pack'],
});
const processorsPerMinute = scienceOnPlatform.inputs.find(x => x.id === 'quantum-processor').rate;
const quantumOnAquiloOpen = await calculateProduction({
  targets: { 'quantum-processor': processorsPerMinute }, location: '玄冥星', recipeIds: ['quantum-processor'],
});
const quantumOnAquiloCoolingLoop = await calculateProduction({
  targets: { 'quantum-processor': processorsPerMinute }, location: '玄冥星',
  recipeIds: ['quantum-processor', 'fluoroketone-cooling'], externalInputs: ['fluoroketone-cold'],
});
const coldReplenishment = quantumOnAquiloCoolingLoop.inputs.find(x => x.id === 'fluoroketone-cold').rate;
const barrelReturn = calculateBarrelTransport({ fluid: '冷氟酮', rate: coldReplenishment, returnEmptyBarrels: true });
const barrelNoReturn = calculateBarrelTransport({ fluid: '冷氟酮', rate: coldReplenishment, returnEmptyBarrels: false });
const result = {
  description: '原问题先检查地点；替代方案为玄冥星产量子处理器、平台产黑瓶。以下仅演示冷液补充量对应的装桶材料，不声称需要把冷液运往新地星，也未计算完整星际运输成本。',
  originalQuestion,
  sourceRecipe: getRecipeDetails({ recipe: 'quantum-processor' }),
  scienceOnPlatform, quantumOnAquiloOpen, quantumOnAquiloCoolingLoop,
  barrelReturn, barrelNoReturn,
};
await writeFile(new URL('./promethium-result.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  originalQuestion: originalQuestion.error?.code,
  sciencePerMinute: 120, processorsPerMinute,
  openColdInput: quantumOnAquiloOpen.inputs.find(x => x.id === 'fluoroketone-cold').rate,
  loopColdInput: coldReplenishment,
  returnBarrelMaterials: barrelReturn.barrelMaterials,
  noReturnBarrelMaterials: barrelNoReturn.barrelMaterials,
  saved: new URL('./promethium-result.json', import.meta.url).pathname,
}, null, 2));
