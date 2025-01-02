import winston from 'winston';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message}`;

  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'development'
      ? colorize()
      : winston.format.uncolorize(),
    logFormat,
  ),
  transports: [
    // Console transport
    new winston.transports.Console(),

    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add request context if needed
export interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: string | undefined;
}

class Logger {
  private context: LogContext = {};

  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }

  clearContext() {
    this.context = {};
  }

  private formatMessage(message: string, context?: LogContext) {
    const logContext = { ...this.context, ...context };
    return { message, ...logContext };
  }

  info(message: string, context?: LogContext) {
    logger.info(this.formatMessage(message, context));
  }

  error(message: string, error?: Error, context?: LogContext) {
    const errorContext = error
      ? {
          errorMessage: error.message,
          stack: error.stack,
          ...context,
        }
      : context;

    logger.error(this.formatMessage(message, errorContext));
  }

  warn(message: string, context?: LogContext) {
    logger.warn(this.formatMessage(message, context));
  }

  debug(message: string, context?: LogContext) {
    logger.debug(this.formatMessage(message, context));
  }

  // Specific methods for Solana transactions
  logTx(message: string, txId: string, context?: LogContext) {
    this.info(message, { txId, ...context });
  }

  logNFTOperation(
    message: string,
    nftAddress: string,
    operation: string,
    context?: LogContext,
  ) {
    this.info(message, { nftAddress, operation, ...context });
  }

  // Express middleware for request logging
  expressLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = uuidv4();
      const startTime = Date.now();

      // Set request ID in context
      this.setContext({ requestId });

      // Log the request
      this.info('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode.toString(),
          duration: `${duration}ms`,
        });
      });

      // Clear context after response
      res.on('close', () => {
        this.clearContext();
      });

      next();
    };
  }

  // Express error handler middleware
  errorHandler() {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
      this.error('Express error', err, {
        method: req.method,
        url: req.url,
        ip: req.ip,
      });
      next(err);
    };
  }

  sinkHandler() {
    return (err: Error, context: LogContext) => {
      this.error('Error in sink', err, context);
    };
  }
}

export const loggerService = new Logger();
