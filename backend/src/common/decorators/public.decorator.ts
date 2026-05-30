import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global JWT guard (e.g. register/login, health).
 * Everything is authenticated by default; @Public is the explicit exception.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
