import { nonNullable } from "./utils.ts";

type OperationUnit = Atom | Expression | Token;
type TokenType = keyof TokenTypeMap;
type TokenConsumer = (
    expression: string,
    index: number,
    units: OperationUnit[]
) => TokenConsumerResult;
type TokenConsumerResult = { units: OperationUnit[]; nextIndex: number };
type ExpressionParseResult = {
    input: string;
    priorityTable: number[][];
    expression: Expression;
};

interface TokenConsumerMap {
    "+": TokenConsumer;
    "-": TokenConsumer;
    "/": TokenConsumer;
    "*": TokenConsumer;
    "%": TokenConsumer;
    "(": TokenConsumer;
    " ": TokenConsumer;
}

interface TokenTypeMap {
    Addition: InstanceType<(typeof Token)["Addition"]>;
    Subtraction: InstanceType<(typeof Token)["Subtraction"]>;
    Multiplication: InstanceType<(typeof Token)["Multiplication"]>;
    Division: InstanceType<(typeof Token)["Division"]>;
    Exponentiation: InstanceType<(typeof Token)["Exponentiation"]>;
    Modulation: InstanceType<(typeof Token)["Modulation"]>;
    UnarySignFlip: InstanceType<(typeof Token)["UnarySignFlip"]>;
    UnaryAddition: InstanceType<(typeof Token)["UnaryAddition"]>;
    UnaryNegation: InstanceType<(typeof Token)["UnaryNegation"]>;
}

interface ExpressionTypeMap {
    Parenthesized: InstanceType<(typeof Expression)["Parenthesized"]>;
    List: InstanceType<(typeof Expression)["List"]>;
}

class ParserError extends Error {
    expression: string;
    index: number | null;

    constructor(message: string, expression: string, index?: number | null) {
        super(message);
        this.expression = expression;
        this.index = index ?? null;
    }
}

class OperationError extends Error {
    operation: string;
    operands: OperationUnit[] | null;

    constructor(
        message: string,
        operation: string,
        operands?: OperationUnit[] | null
    ) {
        super(message);
        this.operation = operation;
        this.operands = operands ?? null;
    }
}

class Atom {
    value: number;
    constructor(value: number) {
        this.value = value;
    }

    static isAtom(value: unknown): value is Atom {
        return value instanceof Atom;
    }
}

class Expression {
    static isExpression(value: unknown): value is Expression {
        return value instanceof Expression;
    }

    static isDerivedExpression<ExprType extends ExpressionType>(
        value: unknown,
        expressionType: ExprType
    ): value is ExpressionTypeMap[ExprType] {
        switch (expressionType) {
            case "Parenthesized":
                return value instanceof Expression.Parenthesized;
            case "List":
                return value instanceof Expression.List;
            default:
                throw new TypeError("Invalid expression type.");
        }
    }

    static Parenthesized = class ParenthesizedExpression extends Expression {};
    static List = class ListExpression extends Expression {};

    units: OperationUnit[];
    constructor(units: OperationUnit[]) {
        this.units = units;
    }

    get value() {
        return evaluateUnits(this.units).value;
    }
}

class Token {
    value: string;
    priority: number;
    consumes: { prev: number; next: number };
    operator: (units: OperationUnit[]) => {
        units: OperationUnit[];
        consume: { prev: number; next: number };
    };

    static #default = {
        operatorResult: {
            units: [new Atom(0)],
            consume: {
                prev: 0,
                next: 0
            }
        },
        consumes: { prev: 0, next: 0 },
        operator: () => Token.#default.operatorResult
    };

    static readonly minPriority = 0;
    static readonly maxPriority = 6;
    static readonly OperationPriority = {
        UnarySignFlip: 0,
        Exponentiation: 1,
        Division: 2,
        Multiplication: 3,
        Addition: 4,
        Subtraction: 5,
        Modulation: 6
    } as const;

    static isToken(value: unknown): value is Token {
        return value instanceof Token;
    }

    static isDerivedToken<TokType extends TokenType>(
        value: unknown,
        tokenType: TokType
    ): value is TokenTypeMap[TokType] {
        switch (tokenType) {
            case "Addition":
                return value instanceof Token.Addition;
            case "Subtraction":
                return value instanceof Token.Subtraction;
            case "Multiplication":
                return value instanceof Token.Multiplication;
            case "Division":
                return value instanceof Token.Division;
            case "Exponentiation":
                return value instanceof Token.Exponentiation;
            case "Modulation":
                return value instanceof Token.Modulation;
            case "UnarySignFlip":
                return value instanceof Token.UnarySignFlip;
            case "UnaryAddition":
                return value instanceof Token.UnaryAddition;
            case "UnaryNegation":
                return value instanceof Token.UnaryNegation;
            default:
                throw new TypeError("Invalid token type.");
        }
    }

    static UnarySignFlip = class UnarySignFlipToken extends Token {
        override value: string = "+-";
        override priority: number = Token.OperationPriority["UnarySignFlip"];
        override consumes: Token["consumes"] = { prev: 0, next: 1 };
        override operator: Token["operator"] = units => {
            if (!isOperable(units[0])) {
                throw new OperationError(
                    "Invalid operands.",
                    "UnarySignFlip",
                    units
                );
            }

            return {
                units: [
                    new Atom(units[0].value * (this.value === "+" ? 1 : -1))
                ],
                consume: { prev: 0, next: 1 }
            };
        };
    };

    static UnaryAddition = class UnaryAdditionToken extends Token.UnarySignFlip {
        override value: string = "+";
    };

    static UnaryNegation = class UnaryNegationToken extends Token.UnarySignFlip {
        override value: string = "-";
    };

    static Addition = class AdditionToken extends Token {
        override value: string = "+";
        override priority: number = Token.OperationPriority["Addition"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Subtraction",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value + units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    static Subtraction = class SubtractionToken extends Token {
        override value: string = "-";
        override priority: number = Token.OperationPriority["Subtraction"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Subtraction",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value - units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    static Multiplication = class MultiplicationToken extends Token {
        override value: string = "*";
        override priority: number = Token.OperationPriority["Multiplication"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Multiplication",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value * units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    static Division = class DivisionToken extends Token {
        override value: string = "/";
        override priority: number = Token.OperationPriority["Division"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Division",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value / units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    static Exponentiation = class ExponentiationToken extends Token {
        override value: string = "*";
        override priority: number = Token.OperationPriority["Exponentiation"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Exponentiation",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value ** units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    static Modulation = class ModulationToken extends Token {
        override value: string = "*";
        override priority: number = Token.OperationPriority["Modulation"];
        override consumes: Token["consumes"] = { prev: 1, next: 1 };
        override operator: Token["operator"] = units => {
            if (!(isOperable(units[0]) && isOperable(units[1]))) {
                throw new OperationError(
                    "Invalid operands.",
                    "Modulation",
                    units
                );
            }

            return {
                units: [new Atom(units[0].value % units[1].value)],
                consume: { prev: 1, next: 1 }
            };
        };
    };

    constructor() {
        if (Object.getPrototypeOf(this) === Token.prototype) {
            throw new SyntaxError(
                "The Token constructor must be called from a derived class."
            );
        }

        this.value = "";
        this.priority = -1;
        this.consumes = Token.#default.consumes;
        this.operator = Token.#default.operator;
    }
}

const isOperable = (value: unknown): value is Exclude<OperationUnit, Token> => {
    return Atom.isAtom(value) || Expression.isExpression(value);
};

const tokenConsumer: TokenConsumerMap = {
    "+": (expression, index, units) => {
        if (
            units[units.length - 1] &&
            !Token.isToken(units[units.length - 1])
        ) {
            return {
                units: [new Token.Addition()],
                nextIndex: index + 1
            };
        }

        let negationCount = 0;
        let i = index;

        while (++i) {
            const char = expression[i];
            if (!char) {
                throw new ParserError(
                    "Unary operator at end of expression.",
                    expression,
                    i - 1
                );
            }

            if (char === "+") negationCount += 0;
            else if (char === "-") negationCount += 1;
            else if (char === "(" || numberRegex.test(char)) {
                return {
                    units: [
                        new Token[
                            negationCount % 2
                                ? "UnaryNegation"
                                : "UnaryAddition"
                        ]()
                    ],
                    nextIndex: i
                };
            } else {
                throw new ParserError(
                    "Unexpected character after unary operation.",
                    expression,
                    i
                );
            }
        }

        return {
            units: [new Token.UnaryAddition()],
            nextIndex: index + 1
        };
    },
    "-": (expression, index, units) => {
        if (
            units[units.length - 1] &&
            !Token.isToken(units[units.length - 1])
        ) {
            return {
                units: [new Token.Addition(), new Token.UnaryNegation()],
                nextIndex: index + 1
            };
        }

        let negationCount = 1;
        let i = index;

        while (++i) {
            const char = expression[i];
            if (!char) {
                throw new ParserError(
                    "Unary operator at end of expression.",
                    expression,
                    i - 1
                );
            }

            if (char === "+") negationCount += 0;
            else if (char === "-") negationCount += 1;
            else if (char === "(" || numberRegex.test(char)) {
                return {
                    units: [
                        new Token[
                            negationCount % 2
                                ? "UnaryNegation"
                                : "UnaryAddition"
                        ]()
                    ],
                    nextIndex: i
                };
            } else {
                throw new ParserError(
                    "Unexpected character after unary operation.",
                    expression,
                    i
                );
            }
        }

        return {
            units: [new Token.UnaryNegation()],
            nextIndex: index + 1
        };
    },
    "/": (expression, index) => {
        return {
            units: [new Token.Division()],
            nextIndex: index + 1
        };
    },
    "*": (expression, index) => {
        const isExponentiation = expression[index + 1] === "*";
        return {
            units: [
                new Token[
                    isExponentiation ? "Exponentiation" : "Multiplication"
                ]()
            ],
            nextIndex: index + 1 + +isExponentiation
        };
    },
    "%": (expression, index) => {
        return {
            units: [new Token.Modulation()],
            nextIndex: index + 1
        };
    },
    "(": (expression, index) => {
        const units: OperationUnit[] = [];
        let terminated = false;
        let i = index + 1;

        while (i < expression.length) {
            const char = expression[i];
            let consumer: TokenConsumer | null = null;

            if (!char) {
                throw new ParserError(
                    "Encountered unterminated opening parenthesis",
                    expression,
                    index
                );
            }
            if (char === ")") {
                terminated = true;
                ++i;
                break;
            }

            consumer =
                (numberRegex.test(char) && consumeNumber) ||
                tokenConsumer[char as keyof TokenConsumerMap] ||
                null;
            if (!consumer) {
                throw new ParserError(
                    `No consumer found for character "${char}"`,
                    expression,
                    i
                );
            }

            const result = consumer(expression, i, units);
            units.push(...result.units);
            i = result.nextIndex;
        }

        return {
            units: [new Expression(units)],
            nextIndex: i
        };
    },
    " ": (expression, index) => {
        return {
            units: [],
            nextIndex: index + 1
        };
    }
};

const numberRegex = /^([+-]?\d+(?:\.\d+)?)/;
const consumeNumber = (
    expression: string,
    index: number
): TokenConsumerResult => {
    const match = expression.slice(index).match(numberRegex);
    if (!match) {
        throw new ParserError(
            "The provided index did not begin a number.",
            expression,
            index
        );
    }

    const numberString = match[1];
    if (!numberString) {
        throw new ParserError(
            "Failed to read capture group from regex match array.",
            expression,
            index
        );
    }

    return {
        units: [new Atom(+numberString)],
        nextIndex: (index += numberString.length)
    };
};

const parseExpression = (input: string): ExpressionParseResult => {
    const units: OperationUnit[] = [];
    const priorityTable: ExpressionParseResult["priorityTable"] = Array.from(
        { length: Token.maxPriority + 1 },
        _ => []
    );

    let index = 0;
    while (index < input.length) {
        const char = nonNullable(input[index]);
        let consumer: TokenConsumer | null = null;

        if (numberRegex.test(char)) consumer = consumeNumber;
        if (char in tokenConsumer)
            consumer = tokenConsumer[char as keyof TokenConsumerMap];

        if (consumer) {
            const result = consumer(input, index, units);

            for (let i = 0; i < result.units.length; ++i) {
                const unit = result.units[i];
                if (Token.isToken(unit)) {
                    nonNullable(priorityTable[unit.priority]).push(
                        units.length + i
                    );
                }
            }

            units.push(...result.units);
            index = result.nextIndex;
        } else {
            throw new ParserError(
                `No consumer found for character "${char}"`,
                input,
                index
            );
        }
    }

    return {
        input,
        priorityTable,
        expression: new Expression(units)
    };
};

const evaluateUnits = (units: OperationUnit[]): Atom => {
    const result = new Atom(0);
    const expr = units.slice();

    while (expr.length > 1) {
        const opToken = expr
            .filter(Token.isToken)
            .sort((a, b) => a.priority - b.priority)[0];
        if (!opToken)
            throw new OperationError(
                "No operation token.",
                "ExpressionEvaluation",
                expr
            );

        const opTokenIndex = expr.indexOf(opToken);
        const opUnitStart =
            opToken.consumes.prev === -1
                ? 0
                : opTokenIndex - opToken.consumes.prev;
        const opUnitEnd =
            opToken.consumes.next === -1
                ? expr.length - 1
                : opTokenIndex + opToken.consumes.next + 1;
        const opUnits = expr
            .slice(opUnitStart, opTokenIndex)
            .concat(expr.slice(opTokenIndex + 1, opUnitEnd));
        const opResult = opToken.operator(opUnits);

        expr.splice(opTokenIndex, 1);
        expr.splice(
            opTokenIndex - opResult.consume.prev,
            opResult.consume.prev + opResult.consume.next,
            ...opResult.units
        );
    }

    if (expr.length === 1) {
        result.value = (expr[0] as Exclude<OperationUnit, Token>).value;
    } else {
        throw new OperationError(
            "Invalid number of result units.",
            "ExpressionEvaluation",
            units
        );
    }

    return result;
};

const test = async () => {
    const startTime = performance.now();
    const parseResult = parseExpression("-27 -++90 /3");
    console.log(parseResult)
    const evalResult = parseResult.expression.value;
    console.log(performance.now() - startTime, evalResult);

    const { inspect } = await import("node:util");
    const { writeFile } = await import("node:fs/promises");
    await writeFile("output.txt", inspect(parseResult, { depth: 5 })).catch(
        () => console.log("Failed to write output file")
    );
};

test();
