import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that a value (ISO-8601 string or Date) is in the future. Used for
 * task due dates so an invalid value is rejected at the edge with a clear
 * VALIDATION_ERROR rather than slipping into the database.
 */
export function IsFutureDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true; // optional
          const date = new Date(value as string);
          return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a future date`;
        },
      },
    });
  };
}
