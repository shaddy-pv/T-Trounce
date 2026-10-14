import { z } from "zod";

export const UpdateAppSettingsInputSchema = z.object({
  liveTranscriptionEnabled: z.boolean(),
});

export type UpdateAppSettingsInput = z.infer<typeof UpdateAppSettingsInputSchema>;
