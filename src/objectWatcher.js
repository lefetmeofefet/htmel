// TODO: Make library.

let gettersSettersPropName = "___gettersSettersProp"

/**
 * Calls `onGet` and `onSet` each time a property is accessed / set.
 * It does so by wrapping the object with getters and setters
 * @param {Object} object
 * @param {Function} onGet
 * @param {Function} onSet
 */
function watch(object, onGet, onSet) {
    if (object[gettersSettersPropName] != null) {
        object[gettersSettersPropName].push({onGet, onSet})
    } else {
        object[gettersSettersPropName] = [{onGet, onSet}];
        watchObject(
            object,
            prop => object[gettersSettersPropName].forEach(getset => getset.onGet(prop)),
            (prop, value) => object[gettersSettersPropName].forEach(getset => getset.onSet(prop, value))
        )
    }
}

function watchObject(object, onGet, onSet) {
    const propsHolder = {};

    const wrapWithGetSet = propertyName => {
        Object.defineProperty(object, propertyName, {
            get() {
                onGet && onGet(propertyName);
                return propsHolder[propertyName]
            },
            set(value) {
                propsHolder[propertyName] = value;
                onSet && onSet(propertyName, value);
            }
        });
    };

    // Wrap existing properties with getters & setters
    const properties = Object.getOwnPropertyDescriptors(object);
    for (let propertyName of Object.keys(properties)) {
        if (propertyName === gettersSettersPropName) {
            continue
        }
        propsHolder[propertyName] = object[propertyName];
        wrapWithGetSet(propertyName)
    }

    // Use proxy to intercept new properties
    Object.setPrototypeOf(object, new Proxy(propsHolder, {
        get(target, propertyName) {
            // This is only called when trying to get non existing props.
            wrapWithGetSet(propertyName);
            Reflect.get(object, propertyName)
        },
        set(target, propertyName, value) {
            wrapWithGetSet(propertyName);
            object[propertyName] = value;
            return true;
        }
    }));
}

export {watch}
