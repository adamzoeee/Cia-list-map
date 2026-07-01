import { recognize } from 'tesseract.js';

export async function recognizeTextFromImage(imageBase64: string): Promise<string> {
  const result = await recognize(imageBase64, 'chi_sim+eng');
  return result.data.text.trim();
}
