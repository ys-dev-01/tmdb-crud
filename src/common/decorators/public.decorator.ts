import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as exempt from the global JwtAuthGuard.
 * Default posture is auth-required; @Public() is an explicit opt-out
 * so every new endpoint is authenticated unless someone deliberately
 * carves out an exception.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
