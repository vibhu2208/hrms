import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  app.setGlobalPrefix('api/v1');
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins);
  allowedOrigins.add('https://hrms-app6.vercel.app');
  app.enableCors({
    origin(requestOrigin, callback) {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      const origin = requestOrigin.replace(/\/$/, '');
      callback(null, isAllowedOrigin(origin, allowedOrigins) ? origin : false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Host', 'X-Tenant-Slug', 'X-API-Key'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Go Staff API running on http://localhost:${port}/api/v1`);
}
bootstrap();

function isAllowedOrigin(origin: string, allowed: Set<string>) {
  if (allowed.has(origin)) return true;
  try {
    const url = new URL(origin);
    const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost');
    if (local && (url.protocol === 'http:' || url.protocol === 'https:')) return true;
    if (url.protocol === 'https:' && (url.hostname === 'gostaff.in' || url.hostname.endsWith('.gostaff.in'))) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
