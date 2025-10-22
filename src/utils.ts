export const nonNullable = <T>(value: T, message?: string): NonNullable<T> => {
    if (value != null) return value
    throw new TypeError(message||"value is nullish")
}