export class HttpError extends Error {
    constructor(
        readonly statusCode: number,
        readonly error: string,
        readonly details: any
    ) {
        super(error);
    }
}

export class NotFoundError extends HttpError {
    constructor(modelName: string, modelId: string) {
        super(404, `Could not find the ${modelName} with the given id`, modelId);
    }
}

export class InvalidFormatError extends HttpError {
    constructor(validationErrors: any[]) {
        super(400, "Invalid Format", validationErrors);
    }
}

export class UnauthorizedError extends HttpError {
    constructor() {
        super(401, "unauthorized", undefined);
    }
}
