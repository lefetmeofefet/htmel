/**
 * HTMEL
 *
 * A bound DomNode contains one or more expressions, and each expression is linked to one or more props. a prop can be
 * linked to more than one expression from different nodes.
 * Example:

 ```
 <div>
 <div>${() => state.a}</div>
 <div class="${() => state.a}-${() => state.b + state.c}"/>
 </div>
 ```

 * Explanation:
 * a (Prop) --> Expression --> DomNode (div textNode)
 *          \
 *           -> Expression --> DomNode (class propertyNode)
 *                         /
 * b (Prop) --> Expression
 *          /
 * c (Prop)
 *
 */

/** TODO
 * print prop to expression map + expression to domNode map. basically, print the whole template process...
 * improve custom dom elements example
 * spread attributes (list of attributes, as dict)
 * profile memory: do we leak? especially watcher
 * performance test
 * Partial CSS update. this is possible:
 *      - $0.sheet.cssRules[1].style.cssText = "background-color: blue;"
 *      - $0.sheet.cssRules[1].style.backgroundColor = "red"
 *
 *      use cases to cover:
 *      - property value (green),
 *      - property name (color),
 *      - whole css line (color: green;)
 *      - whole css selector content (color: green; font-size: 24px;)
 *      - css selector (.fakio>#ikaramba)
 *      - whole css rule (selector + content) / multiple rules
 *      All of these must work together!!!
 *
 * make element wrapper: HTMElement, like litElement
 * // TODO IMPORTANT HERE:
 * V annoying to have to wrap each component with <div>. multiple elements inside template? THINK HOW TO FIX THIS IS IMPORTANT
 * support style dict
 * list additions: instead of overwriting the whole list each time, check which bound objects CHANGED (added / removed)
 * list: remove the container element. it fucks up css
 * V props should be removed if value is null. example: when making text-input element, placeholder shouldn't be there if its null
 * V attr name support: a must. attributes like "readonly" have to disappear to not be readonly
 * V allow one state object to be shared with multiple templates(redux implementation without the shit)
 * V true / false attributes pass as strings and its annoying
 * V Don't display null / undefined text nodes (i wanna do ${() => this.state.something && <stuff/>})
 * Make props that start with "on" when called throw events! so that the parent element will listen normally
 * // TODO: END OF IMPORTANT

 * support promises as expressions alongside cbs
 * call expressions with some parameter that gives them something, idk what yet (smth => ... instead of () => ...)
 * tests! so many tests to make.
 *      - Error handling
 *          - expression in html tag
 *          - expression in attr name
 *          - 2 expressions in event ("onclick") attr
 *      - Edge cases
 *          - event handler that returns a function instead should run that returned function as well
 *          - expression that returns nothing shouldn't crash
 *          - TextNode, test type changes: string -> list, obj -> list, string -> obj, list -> obj, list -> string, list -> obj
 *          -
 * documentation
 *      - the behavior of events (functino, function that returns function...)
 *      - attributes: strings vs null vs undefined vs object vs function
 *      - lists: list container
 */

/** TODO: Problem with watch is that a re-evaluation won't be queued if a parameter wasn't accessed before,
 *  and if some other conditional was changed but it's not watched, then unexpected behavior can happen.
 *  consider the example:
 *  <div>${() => window.shouldKill && props.something}</div>
 *  a rerender shouldnt happen when window.shouldKill is changed, but it should happen if props.something
 *  changed, because window.shouldKill could have caused it to be accessed. Problem is, it wasnt accessed
 *  so it wont trigger evaluation
 */

import {watch} from "./objectWatcher.js"
import {find, SearchLocations} from "./domNodeFinder.js"

function throttle(func, wait) {
    // Leading throttle
    let context, args, result;
    let timeout = null;
    let previous = 0;
    let later = function () {
        previous = Date.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
    };
    return function () {
        let now = Date.now();
        let remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            result = func.apply(context, args);
            if (!timeout) context = args = null;
        } else if (!timeout) {
            timeout = setTimeout(later, remaining);
        }
        return result;
    };
}

class BoundNode {
    /**
     * A single HTML node, containing all that's needed
     * @param {[Expression]} expressions
     * @param {HTMLElement} domNode
     * @param {String} expressionsLocation
     */
    constructor(expressions, domNode, expressionsLocation) {
        this.expressions = expressions;
        this.domNode = domNode;
        this.expressionsLocation = expressionsLocation;
        /** @type String */
        this.initialValue = {
            // TextNode content
            [SearchLocations.TEXT_NODE]: () => domNode.data,
            // Attribute value
            [SearchLocations.ATTR_VALUE]: () => domNode.value,
            // Attribute name
            [SearchLocations.ATTR_NAME]: () => domNode.name,
        }[expressionsLocation]();
        this.ownerElement = this.domNode.ownerElement
    }

    update() {
        if (this.expressionsLocation === SearchLocations.TEXT_NODE) {
            this.updateTextNodeValue()
        } else if (this.expressionsLocation === SearchLocations.ATTR_VALUE) {
            this.updateAttributeNodeValue()
        } else if (this.expressionsLocation === SearchLocations.ATTR_NAME) {
            this.updateAttributeNodeName()
        }
    }

    updateTextNodeValue() {
        let expression = this.expressions[0];
        let newValue = expression.lastResult;
        if (newValue == null || newValue === false) {
            newValue = ""
        }

        // Remove old array
        if (this._lastTextNodeValue instanceof Array) {
            // TODO: Keyed logic for performance: dont delete all, only changed keys
            // TODO: Great performance proposition: keep global dict of state object -> htmel template. this way,
            //  when the array is re-rendered, all previous templates are not recalculated
            // Delete old array, make domNode the last remaining value
            for (let domNodeToRemove of this._arrayDomNodes) {
                domNodeToRemove.remove()
            }
            this._arrayDomNodes = [];
        }

        if (newValue instanceof Array) {
            this._arrayDomNodes = newValue.map(val => typeof val === "object" ? val : document.createTextNode(val));
            let listContainer = document.createElement("htmel-list-container");
            this.domNode.replaceWith(listContainer);
            this.domNode = listContainer;

            for (let domNodeToAdd of this._arrayDomNodes) {
                this.domNode.appendChild(domNodeToAdd);
            }
        } else if (typeof newValue === "object") {
            // Either element or object. If object, wat do we do??
            // TODO: WAT DO WE DO?
            this.domNode.replaceWith(newValue);
            this.domNode = newValue;
        } else {
            if (typeof this._lastTextNodeValue === "object") {
                // Replace old object with string
                let newTextNode = document.createTextNode(newValue);
                this.domNode.replaceWith(newTextNode);
                this.domNode = newTextNode;
            } else {
                // If just string
                this.domNode.data = newValue;
            }
        }

        this._lastTextNodeValue = newValue;
    }

    updateAttributeNodeValue() {
        // Checks if expression is an event handler, and adds an event listener if true.
        if (this.expressions[0].isEventHandler) {
            if (this.expressions.length > 1) {
                let forbiddenEventHandlerText = _fillStrWithExpressions(this.initialValue, this.expressions);
                throw `HTMEL: Cant have more than one expression as event handler: ${forbiddenEventHandlerText}`
            }
            this._setEventListener();
        } else {
            let lastResult = this.expressions[0].lastResult;
            let isJustExpression = this.expressions.length === 1 && this.initialValue.length === this.expressions[0].id.length;
            let ownerElementPropValue = undefined;

            if (isJustExpression && lastResult === true) {
                // If we get true, just set the attribute with no value (<div a></div>)
                this.setDomNode("");
            } else if (isJustExpression && (lastResult === false || lastResult == null)) {
                // If value is falsy, remove the attribute
                this.ownerElement.removeAttribute(this.domNode.name);
            } else if (isJustExpression && ["function", "object"].includes(typeof lastResult)) {
                // if attr value is function or object, set it directly on the element instead of attribute because
                // attributes can only hold strings
                ownerElementPropValue = lastResult
                this.setDomNode(lastResult);
            } else {
                // If string, replaces ids with expression values
                let newValue = this.initialValue;
                for (let expression of this.expressions) {
                    newValue = newValue.replace(expression.id, expression.lastResult)
                }
                this.setDomNode(newValue);
            }

            this.ownerElement[this.domNode.name] = ownerElementPropValue;
        }
    }

    setDomNode(value) {
        this.domNode.value = value;
        if (this.domNode.ownerElement == null) {
            this.ownerElement.setAttributeNode(this.domNode)
        }
    }

    updateAttributeNodeName() {
        let lastResult = this.expressions[0].lastResult;
        let isJustExpression = this.expressions.length === 1 && this.initialValue.length === this.expressions[0].id.length;

        if (this._lastAttributeMap) {
            // Removes last attribute mapping if there was
            for (let [attrName, _] of this._lastAttributeMap) {
                this.ownerElement.removeAttribute(attrName);
            }
            this._lastAttributeMap = null
        }
        else {
            // Removes last attribute
            this.ownerElement.removeAttribute(this.domNode.name)
        }

        if (isJustExpression && (lastResult === false || lastResult == null || lastResult === "")) {
            // Don't add any attribute if value is falsy
            return
        }

        if (isJustExpression && typeof lastResult === "object") {
            // If we get an object, insert it as key-value mapping of attributes
            this._lastAttributeMap = Object.entries(lastResult)
            for (let [attrName, value] of this._lastAttributeMap) {
                this.ownerElement.setAttribute(attrName, value);
            }
        }
        else {
            // If string, replaces ids with expression values
            let newName = this.initialValue;
            for (let expression of this.expressions) {
                newName = newName.replace(expression.id, expression.lastResult)
            }

            this.ownerElement.setAttribute(newName, this.domNode.value);
            this.domNode = this.ownerElement.getAttributeNode(newName);
        }
    }

    /**
     * Replaces attribute node that starts with "on" with event listener.
     * This will never run twice on the same expression, because no props are linked, because event handler expressions
     * don't evaluate until the event is caught.
     * @private
     */
    _setEventListener() {
        let eventName = this.domNode.name.substring(2); // Remove the `on` from `onclick`

        this.domNode.ownerElement.addEventListener(eventName, (...args) => {
            const result = this.expressions[0].lastResult(...args);

            // In case expression returns another function (user wrote ${() => () => print("stuff)} for example)
            if (typeof result === "function") {
                return result(...args)
            }

            // TODO: If user returned a string (onclick="${() => state.wat ? "alert(1)" : "alert(2)}") we should eval that
            return result
        });
        this.domNode.ownerElement.removeAttributeNode(this.domNode);
    }
}

function _randomId() {
    return new Array(4).fill(0).map(
        () => Math.random().toString(36).substr(2, 9)).join("-");
}

class Expression {
    constructor(expressionCb) {
        this._cb = expressionCb;
        this.id = _randomId();
        this.lastResult = null;
        this.boundNode = null;
        this.isEventHandler = false;
        this.isStatic = (typeof this._cb) !== "function";
    }

    execute() {
        if (this.isEventHandler || this.isStatic) {
            this.lastResult = this._cb;
        } else {
            this.lastResult = this._cb();
        }
    }
}

function _joinTemplateStrings(arr1, arr2) {
    return arr2.reduce((accu, current, i) => accu + current + arr1[i + 1], arr1[0])
}

/**
 * Creates a template HTML element from html string
 * @param {String} html
 * @returns {Element}
 * @private
 */
function _createTemplateElement(html) {
    const templateTag = document.createElement("template");
    templateTag.innerHTML = html;
    return templateTag;
}

/**
 * Receives a textNode and divider (`textToMakeNode`), and breaks up the textNode into 3 textNodes: before, after and
 * middle, and returns the middle. The middle is the part that's equal to `textToMakeNode` and its value is changed to it.
 * the other parts are inserted into the DOM.
 * Example: node "123" with divider "2" will return insert "1" and "3" into the DOM, and return "2".
 * node "23" with divider "2" will insert "3" into DOM and return "2".
 * @param {Text} textNode
 * @param {String} textToMakeNode
 * @returns {Text}
 * @private
 */
function _breakUpTextNodeToSmallerNodes(textNode, textToMakeNode) {
    let wholeText = textNode.data;
    let textStartIndex = textNode.data.indexOf(textToMakeNode);
    let textEndIndex = textStartIndex + textToMakeNode.length;

    // Insert node before
    if (textStartIndex !== 0) {
        textNode.parentNode.insertBefore(
            document.createTextNode(wholeText.substring(0, textStartIndex)),
            textNode
        );
    }

    // Insert node after
    if (textEndIndex < wholeText.length) {
        textNode.parentNode.insertBefore(
            document.createTextNode(wholeText.substring(textEndIndex)),
            textNode.nextSibling
        );
    }

    textNode.data = wholeText.substring(textStartIndex, textEndIndex);
    return textNode;
}

function _fillStrWithExpressions(str, expressions) {
    for (let exp of expressions) {
        str = str.replace(exp.id, "${" + exp._cb.toString() + "}")
    }
    return str
}

/**
 * Creates BoundNodes from expressionIds inside `element`.
 * Each BoundNode references a list of expressions, and each expression has a reference to it's bound node.
 * @param {HTMLTemplateElement} element
 * @param {[Expression]} expressions
 * @private
 */
function bindNodesToExpressions(element, expressions) {
    /** @type {Map<Node, BoundNode>} */
    const domNodeToBoundNode = new Map();

    for (let expression of expressions) {
        let searchResult = null;
        for (let child of element.content.children) {
            searchResult = find(child, expression.id);
            if (searchResult != null) {
                break;
            }
        }
        if (searchResult == null) {
            throw `HTMEL: Expression location is not valid: ${"${" + expression._cb.toString() + "}"}`
        }
        let {domNode, searchLocation} = searchResult;

        // Break up textNode
        if (searchLocation === SearchLocations.TEXT_NODE) {
            domNode = _breakUpTextNodeToSmallerNodes(domNode, expression.id)
        }

        // If template is inside html tag name, throw exception
        if (searchLocation === SearchLocations.HTML_TAG) {
            let forbiddenTagText = _fillStrWithExpressions(`<${domNode.localName}>`, [expression]);
            throw `HTMEL: Calculating element name is not allowed: ${forbiddenTagText}`
        }

        // Expressions on attrs that start with "on" are event handlers
        if (searchLocation === SearchLocations.ATTR_VALUE && domNode.name.startsWith("on")) {
            expression.isEventHandler = true;
        }

        // Create BoundNodes, deduping domNodes that are found multiple times because of multiple expressions
        if (domNodeToBoundNode.has(domNode)) {
            let boundNode = domNodeToBoundNode.get(domNode);
            boundNode.expressions.push(expression);
            expression.boundNode = boundNode;
        } else {
            let boundNode = new BoundNode([expression], domNode, searchLocation);
            domNodeToBoundNode.set(domNode, boundNode);
            expression.boundNode = boundNode;
        }
    }

    console.log("DomNodes + Expressions: ");
    console.log([...domNodeToBoundNode.values()]);
}

function createBoundElements(propsObjects, strings, expressionCbs) {
    // Create expressions and htmel element
    const expressions = expressionCbs.map(cb => new Expression(cb));
    const element = _createTemplateElement(_joinTemplateStrings(strings, expressions.map(e => e.id)));
    bindNodesToExpressions(element, expressions);

    let isExecutingExpression = false;
    /** @type {Set<String>} */
    let changedPropsList = new Set();
    /** @type {Set<String>} */
    let propsAccessedInsideExpression = new Set();

    propsObjects.forEach((propsObject, index) => {
        if (typeof propsObject !== "object") {
            throw `HTMEL: Props object must be an object, got ${typeof propsObject}`
        }
        watch(
            propsObject,
            key => isExecutingExpression && propsAccessedInsideExpression.add(`state${index}.${key}`),
            (key, value) => {
                // TODO: Check if value is different than the current one, and spare expression evaluations
                // We use `state${index}.${key}` because the same prop in different states objects has to be different
                changedPropsList.add(`state${index}.${key}`);
                render();
            }
        );
    })

    /** @type {Map<String, Set<Expression>>} */
    let propsToExpressions = new Map();

    const render = throttle(() => {
        let expressionsToExecute = new Set();
        for (let changedProp of changedPropsList) {
            let _expressionsToExecute = propsToExpressions.get(changedProp);
            if (_expressionsToExecute) {
                _expressionsToExecute.forEach(expression => expressionsToExecute.add(expression));
            } else {
                console.warn(`A prop changed but no expression is linked to it: ${
                    changedProp.substr(changedProp.indexOf(".") + 1)}`)
            }
        }
        changedPropsList.clear();
        updateExpressions([...expressionsToExecute])

    }, 1000 / 60);


    /** @param {[Expression]} exs */
    const updateExpressions = exs => {
        for (let expression of exs) {
            isExecutingExpression = true;
            expression.execute();
            isExecutingExpression = false;

            // Map new props to expressions
            propsAccessedInsideExpression.forEach(propName => {
                if (!propsToExpressions.has(propName)) {
                    propsToExpressions.set(propName, new Set());
                }
                propsToExpressions.get(propName).add(expression)
            });
            propsAccessedInsideExpression.clear();
        }

        // Update nodes with updated expressions
        for (let boundNode of new Set(exs.map(ex => ex.boundNode))) {
            boundNode.update()
        }
    };

    // Initial render
    updateExpressions(expressions);
    return [...element.content.children]
}

/**
 * Returns an html element that will be modified when state object's properties change.
 * @param {[Object]} propsObjects Holds the state of this htmel element
 * @returns {function(*=, ...[*]): Element}
 */
function htmel(...propsObjects) {
    return (strings, ...expressionCbs) => {
        let elements = createBoundElements(propsObjects, strings, expressionCbs);
        if (elements.length > 1) {
            console.warn("HTMLefeTemplate: More than one child element in template, ignoring all other than the first")
        }
        else if (elements === 0) {
            throw "HTMEL: Component can't be empty"
        }
        return elements[0]
    }
}

function htmels(...propsObjects) {
    return (strings, ...expressionCbs) => {
        return createBoundElements(propsObjects, strings, expressionCbs)
    }
}

export default htmel
export {htmels}
