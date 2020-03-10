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
 * list additions: instead of overwriting the whole list each time, check which bound objects CHANGED (added / removed)
 * when both attribute name and value contain expression, only one BoundNode is created for the name and value is not updated
 * support promises as expressions alongside cbs
 * call expressions with some parameter that gives them something, idk what yet (smth => ... instead of () => ...)
 * receive multiple state objects (redux implementation without the shit)
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
 *
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
     * @param {Element} domNode
     * @param {String} bindingLocation
     */
    constructor(expressions, domNode, bindingLocation) {
        this.expressions = expressions;
        this.domNode = domNode;
        this.bindingLocation = bindingLocation;
        /** @type String */
        this.initialValue = {
            // TextNode content
            [SearchLocations.TEXT_NODE]: () => domNode.data,
            // Attribute value
            [SearchLocations.ATTR_VALUE]: () => domNode.value,
        }[bindingLocation]();
    }

    update() {
        // TODO: style breaking? if (type === NodeTypes.TEXT_NODE && domNode.parentElement.localName !== "style") {
        if (this.bindingLocation === SearchLocations.TEXT_NODE) {
            this.updateTextNodeValue()
        } else {
            this.updateAttributeNodeValue()
        }
    }

    updateTextNodeValue() {
        let expression = this.expressions[0];
        let newValue = expression.lastResult;

        // TODO: Deal with typeof === "function" and promises

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
            // Deal with element
            // TODO: Check if instanceof HTMLElement. if not, what do we do with objects? attr key-value mapping?
            this.domNode.replaceWith(newValue);
            this.domNode = newValue;
            console.log("##### Override object with element")
        } else {
            if (typeof this._lastTextNodeValue === "object") {
                // Handle an object becoming a string
                let newTextNode = document.createTextNode(newValue);
                this.domNode.replaceWith(newTextNode);
                this.domNode = newTextNode;
            } else {
                this.domNode.data = newValue;
            }
        }

        this._lastTextNodeValue = newValue;

    }

    updateAttributeNodeValue() {
        // Checks if expression is an event handler, and adds an event listener if true.

        if (this.bindingLocation === SearchLocations.ATTR_VALUE && this.expressions[0].isEventHandler) {
            if (this.expressions.length > 1) {
                let forbiddenEventHandlerText = fillStrWithExpressions(this.initialValue, this.expressions);
                throw `HTMEL: Cant have more than one expression as event handler: ${forbiddenEventHandlerText}`
            }
            this._setEventListener();
        } else {
            // Replaces ids with expression values
            let newValue = this.initialValue;
            for (let expression of this.expressions) {
                newValue = newValue.replace(expression.id, expression.lastResult)
            }

            // TODO: Save last domValue and only update if the value changed. spare dom updates yay
            this.domNode.value = newValue;
        }
    }

    /**
     * This will never run twice, because no props are linked, because event handler expressions don't evaluate.
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

    if (templateTag.content.children.length > 1) {
        console.warn("HTMLefeTemplate: More than one child element in template, ignoring all other than the first")
    } else if (templateTag.content.children.length === 0) {
        throw "HTMEL: Component can't be empty"
    }
    return templateTag.content.firstElementChild;
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

function fillStrWithExpressions(str, expressions) {
    for (let exp of expressions) {
        str = str.replace(exp.id, "${" + exp._cb.toString() + "}")
    }
    return str
}

/**
 * Creates BoundNodes from expressionIds inside `element`.
 * Each BoundNode references a list of expressions, and each expression has a reference to it's bound node.
 * @param {Element} element
 * @param {[Expression]} expressions
 * @private
 */
function bindNodesToExpressions(element, expressions) {
    /** @type {Map<Element, BoundNode>} */
    const domNodeToBoundNode = new Map();

    for (let expression of expressions) {
        let searchResult = find(element, expression.id);
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
            let forbiddenTagText = fillStrWithExpressions(`<${domNode.localName}>`, [expression]);
            throw `HTMEL: Calculating element name is not allowed: ${forbiddenTagText}`
        }

        // If template is inside attribute name, throw exception
        if (searchLocation === SearchLocations.ATTR_NAME) {
            let forbiddenAttrValueText = fillStrWithExpressions(domNode.localName, [expression]);
            throw `HTMEL: Calculating attribute name is not allowed: ${forbiddenAttrValueText}`
        }

        // Expressions on attrs that start with "on" shouldn't evaluate, setting `isEventHandler`
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

/**
 * Returns an html element that will be modified when state object's properties change.
 * @param {Object} propsObject Holds the state of this htmel element
 * @param {Number} maxFps The maximum rate at which updates are applied to DOM. More FPS = smoother UI.
 * @returns {function(*=, ...[*]): Element}
 */
function htmel(propsObject = {}, maxFps = 60) {
    return (strings, ...expressionsCbs) => {
        // Create expressions and htmel element
        const expressions = expressionsCbs.map(cb => new Expression(cb));
        const element = _createTemplateElement(_joinTemplateStrings(strings, expressions.map(e => e.id)));
        bindNodesToExpressions(element, expressions);

        let isExecutingExpression = false;
        /** @type {Set<String>} */
        let changedPropsList = new Set();
        /** @type {Set<String>} */
        let propsAccessedInsideExpression = new Set();

        if (typeof propsObject === "object") {
            watch(
                propsObject,
                key => isExecutingExpression && propsAccessedInsideExpression.add(key),
                (key, value) => {
                    // TODO: Check if value is different than the current one, and spare expression evaluations
                    changedPropsList.add(key);
                    render();
                }
            );
        }

        /** @type {Map<String, Set<Expression>>} */
        let propsToExpressions = new Map();

        const render = throttle(() => {
            let expressionsToExecute = new Set();
            for (let changedProp of changedPropsList) {
                let _expressionsToExecute = propsToExpressions.get(changedProp);
                if (_expressionsToExecute) {
                    _expressionsToExecute.forEach(expression => expressionsToExecute.add(expression));
                } else {
                    console.warn(`A prop changed but no expression is linked to it: ${changedProp}`)
                }
            }
            changedPropsList.clear();
            updateExpressions([...expressionsToExecute])

        }, 1000 / maxFps);


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
        return element
    }
}

export default htmel
