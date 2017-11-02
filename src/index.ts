import { APIGatewayEvent, Context, ProxyCallback, ProxyHandler, ProxyResult } from "aws-lambda";
import { ClassType, transformAndValidate } from "class-transformer-validator";
import {
    IsEmail,
    IsUUID,
    IsString,
    Validate,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments
} from "class-validator";
import { Expose } from "class-transformer";

import { UnauthorizedError } from "./errors";
export * from "./errors";

class None {}

@ValidatorConstraint({ name: "dateString", async: false })
class DateStringValidator implements ValidatorConstraintInterface {
    public validate(value: any, validationArguments: ValidationArguments): boolean {
        return !isNaN(new Date(value).getTime());
    }

    public defaultMessage(): string {
        return "($value) is not a valid date string.";
    }

}

export class Claims {
    @IsEmail()
    public email: string;

    @IsUUID("4")
    @Expose({ name: "sub" })
    public userId: string;

    @IsString()
    @Expose({ name: "cognito:username"})
    public username: string;

    @Validate(DateStringValidator)
    private iat: string;
    get IssuedAt(): Date { return new Date(this.iat); }
}

export interface IRequest<
    Path extends object,
    Query extends object,
    Body extends object,
    Headers extends object,
    C extends Claims> {
        path: Path;
        query: Query;
        body: Body;
        headers: Headers;
        claims?: C;
}

export interface ILambduhParameters<
    P extends object,
    Q extends object,
    B extends object,
    H extends object,
    C extends Claims> {
        pathType?: ClassType<P>;
        queryType?: ClassType<Q>;
        bodyType?: ClassType<B>;
        headersType?: ClassType<H>;
        claimsType?: ClassType<C>;
        claimsRequired?: boolean;

}

export type IHandler<P extends object, Q extends object, B extends object, H extends object, C extends Claims> =
    (request: IRequest<P, Q, B, H, C>, event: APIGatewayEvent, context: Context) => Promise<any>;

export function Lambduh<P extends object, Q extends object, B extends object, H extends object, C extends Claims>(
    options: ILambduhParameters<P, Q, B, H, C> | IHandler<P, Q, B, H, C>,
    handler?: IHandler<P, Q, B, H, C>
): ProxyHandler {
    return (event: APIGatewayEvent, context: Context, cb?: ProxyCallback) => {
        if (!cb) {
            throw new Error("Invalid proxy event (no callback)");
        }
        (async () => {
            const  {
                pathType = None as ClassType<P>,
                queryType = None as ClassType<Q>,
                bodyType = None as ClassType<B>,
                headersType = None as ClassType<H>,
                claimsType = Claims as ClassType<C>,
                claimsRequired = false
            } = handler === undefined ? {} : options as ILambduhParameters<P, Q, B, H, C>;

            if (handler === undefined) {
                handler = options as IHandler<P, Q, B, H, C>;
            }

            try {
                const path = await transformAndValidate(pathType, event.pathParameters || {}, {
                    validator: { validationError: { target: false } },
                });
                const query = await transformAndValidate(queryType, event.queryStringParameters || {}, {
                    validator: { validationError: { target: false } },
                });
                const body = await transformAndValidate(bodyType, event.body || {}, {
                    validator: { validationError: { target: false } },
                });
                const headers = await transformAndValidate(headersType, event.headers || {}, {
                    validator: { validationError: { target: false } },
                });
                let claims: C | undefined;
                const authorizer = (event.requestContext as any).authorizer;
                if (authorizer !== undefined && authorizer.claims !== undefined) {
                    claims = (await transformAndValidate(
                        claimsType, JSON.stringify((event.requestContext as any).authorizer.claims)
                    )) as C;
                }

                if (claimsRequired && claims === undefined) {
                    throw new UnauthorizedError();
                }

                const request = { path, query, body, headers, claims };
                const response = await handler(request, event, context);
                return cb(undefined, { body: convertToString(response), statusCode: 200});
            } catch (error) {
                if (error.length) {
                    return cb(undefined, {
                        body: JSON.stringify({
                            statusCode: 400,
                            error: "Incorrect Parameters",
                            details: error
                        }),
                        statusCode: 400
                    });
                } else if (error.statusCode) {
                    return cb(undefined, { body: convertToString(error), statusCode: error.statusCode });
                }
                return cb(undefined, { body: convertToString(error), statusCode: 500 });
            }
        })();
    };
}

function convertToString(data: any): string {
    if (typeof data === "string") {
        return data;
    }
    return JSON.stringify(data);
}
