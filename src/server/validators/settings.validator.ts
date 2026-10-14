import { z } from "zod";

export const UpdateAppSettingsInputSchema = z.object({
  liveTranscriptionEnabled: z.boolean().optional(),
  postTranscriptionEnabled: z.boolean().optional(),
});

export type UpdateAppSettingsInput = z.infer<typeof UpdateAppSettingsInputSchema>;
