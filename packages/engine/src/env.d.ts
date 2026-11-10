/**
 * The one runtime global the engine uses. It exists in every place the engine
 * runs (browsers, Workers and Node), but is typed by the DOM and Node
 * libraries, and the engine is compiled against neither on purpose.
 */
declare function structuredClone<T>(value: T): T;
