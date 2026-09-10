export const modelProviders = ['openai','anthropic','gemini','deepseek','glm','qwen','mistral','meta','generic'];
export function modelProvider(value) {
  const name=String(value||'').toLowerCase();
  if(/claude|anthropic/.test(name))return 'anthropic';
  if(/gemini|google/.test(name))return 'gemini';
  if(/deepseek/.test(name))return 'deepseek';
  if(/glm|zhipu|智谱/.test(name))return 'glm';
  if(/qwen|qwq/.test(name))return 'qwen';
  if(/mistral|mixtral/.test(name))return 'mistral';
  if(/llama|meta/.test(name))return 'meta';
  if(/gpt|openai|^o[134](?:-|$)/.test(name))return 'openai';
  return 'generic';
}
export function modelIcon(value) {
  const provider=modelProvider(value);
  const day=provider==='glm'?'glm.png':provider+'.svg';
  return `<span class="model-icon-pair" aria-hidden="true"><img class="model-icon-day" src="assets/logos/${day}" alt=""><img class="model-icon-night" src="assets/logos/night/${provider}.svg" alt=""></span>`;
}
