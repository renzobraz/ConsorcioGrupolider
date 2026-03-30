
import { GoogleGenAI, Type } from "@google/genai";
import { ProductType, CorrectionIndex, PaymentPlanType, BidBaseType, CalculationMethod } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ExtractedQuotaData {
  group?: string;
  quotaNumber?: string;
  contractNumber?: string;
  creditValue?: number;
  termMonths?: number;
  adminFeeRate?: number;
  reserveFundRate?: number;
  dueDay?: number;
  correctionIndex?: CorrectionIndex;
  productType?: ProductType;
  adhesionDate?: string;
  firstAssemblyDate?: string;
  firstDueDate?: string;
}

export const extractQuotaDataFromContract = async (fileBase64: string, mimeType: string): Promise<ExtractedQuotaData> => {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Extraia os dados deste contrato de consórcio. Retorne apenas o JSON com os campos solicitados. 
  Se não encontrar um campo, deixe-o nulo.
  Datas devem estar no formato YYYY-MM-DD.
  Valores numéricos devem ser números, não strings.
  
  Campos esperados:
  - group (string): Número do grupo
  - quotaNumber (string): Número da cota
  - contractNumber (string): Número do contrato
  - creditValue (number): Valor do crédito/carta
  - termMonths (number): Prazo em meses
  - adminFeeRate (number): Taxa de administração total (%)
  - reserveFundRate (number): Fundo de reserva total (%)
  - dueDay (number): Dia do vencimento (1-31)
  - correctionIndex (string): Um dos seguintes: INCC, IPCA, INPC
  - productType (string): Um dos seguintes: VEICULO, IMOVEL
  - adhesionDate (string): Data de adesão
  - firstAssemblyDate (string): Data da primeira assembleia
  - firstDueDate (string): Data do primeiro vencimento
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          group: { type: Type.STRING },
          quotaNumber: { type: Type.STRING },
          contractNumber: { type: Type.STRING },
          creditValue: { type: Type.NUMBER },
          termMonths: { type: Type.INTEGER },
          adminFeeRate: { type: Type.NUMBER },
          reserveFundRate: { type: Type.NUMBER },
          dueDay: { type: Type.INTEGER },
          correctionIndex: { type: Type.STRING },
          productType: { type: Type.STRING },
          adhesionDate: { type: Type.STRING },
          firstAssemblyDate: { type: Type.STRING },
          firstDueDate: { type: Type.STRING },
        }
      }
    }
  });

  try {
    const text = response.text;
    return JSON.parse(text);
  } catch (error) {
    console.error("Erro ao processar resposta da IA:", error);
    throw new Error("Não foi possível extrair os dados do contrato.");
  }
};
