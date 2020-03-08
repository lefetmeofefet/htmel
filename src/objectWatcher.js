
function watch(object, onGet, onSet) {
    // TODO: Understand this shit. Why put setters and getters on existing objects instead of removing them all, and
    //  save them on the `existingPropsHolder`, and when we get access to non-existing prop we check it in holder?
    // This answer explains the logic pretty well:
    // https://stackoverflow.com/questions/52031628/transform-a-javascript-object-into-a-proxy-and-not-its-reference

    // proxy a new prototype for that object...
    const ctr = {};
    const existingPropsHolder = {};

    // For existing props of object
    const properties = Object.getOwnPropertyDescriptors(object);
    for (let propertyName of Object.keys(properties)) {
        existingPropsHolder[propertyName] = object[propertyName];
        Object.defineProperty(object, propertyName, {
            get() {
                onGet && onGet(propertyName);
                return existingPropsHolder[propertyName]
            },
            set(value) {
                existingPropsHolder[propertyName] = value;
                onSet && onSet(propertyName, value);
            }
        })
    }

    // For new props, i think
    Object.setPrototypeOf(object, new Proxy(ctr, {
        get(target, key) {
            onGet && onGet(key);
            return Reflect.get(target, key) || ctr[key];
        },
        set(target, key, value) {
            // setting this container object instead of object keeps object clean,
            // and allows get access to that property to continue being
            // intercepted by the proxy
            Reflect.set(ctr, key, value);
            onSet && onSet(key, value);
            return true;
        }
    }));
}

export {watch}
