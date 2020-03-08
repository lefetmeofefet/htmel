/**
 * A bound DomNode contains one or more expressions, and each expression is linked to one or more props. a prop can be
 * linked to more than one expression from different nodes
 *
 *
 * Prop --> Expression --> DomNode
 *      \               \
 *       -> Expression --> DomNode
 *                      /
 * Prop --> Expression -
 *       /
 * Prop -
 *
 */

/** TODO
 * print prop to expression map + expression to domNode map. basically, print the whole template process...
 * spread attributes (list of attributes, as dict?)
 * make guide
 *      - in the guide, include react example like here: https://github.com/developit/htm
 *      - test run by jonathan, stav
 * Profile memory: do we leak? especially watcher
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
 * Make element wrapper: HTMLefetElement, like litElement
 * list additions: instead of overwriting the whole list each time, check which bound objects CHANGED (added / removed)
 * when both attribute name and value contain expression, only one BoundNode is created for the name and value is not updated
 * Move stuff into consts - better minifying
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
import {find, NodeTypes} from "./domNodeFinder.js"

function throttle(func, wait, options) {
    let context, args, result;
    let timeout = null;
    let previous = 0;
    if (!options) options = {};
    let later = function () {
        previous = options.leading === false ? 0 : Date.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
    };
    return function () {
        let now = Date.now();
        if (!previous && options.leading === false) previous = now;
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
        } else if (!timeout && options.trailing !== false) {
            timeout = setTimeout(later, remaining);
        }
        return result;
    };
}

class BoundNode {
    /**
     *
     * @param {[Expression]} expressions
     * @param {Element} domNode
     * @param {String} type
     * @param {Function} updateDomNodeCb
     * @param {String} initialValue
     */
    constructor(expressions, domNode, type, updateDomNodeCb, initialValue) {
        this.expressions = expressions;
        this.domNode = domNode;
        this.type = type;
        this.updateDomNodeCb = updateDomNodeCb;
        this.initialValue = initialValue;

        if (type === NodeTypes.TEXT_NODE && domNode.parentElement.localName !== "style") {
            this.updateCb = this.updateTextNodeValue();
        } else {
            this.updateCb = this.updateNodeValue();
        }
    }

    update() {
        this.updateCb()
    }

    updateTextNodeValue() {
        let expression = this.expressions[0];
        let lastValue = "";
        let arrayDomNodes = [];
        return () => {
            let newValue = expression.lastResult;

            // TODO: Deal with typeof === "function" and promises

            if (lastValue instanceof Array) {
                // TODO: Keyed logic for performance: dont delete all, only changed keys
                // Delete old array, make domNode the last remaining value
                for (let domNodeToRemove of arrayDomNodes) {
                    if (domNodeToRemove !== this.domNode) {
                        domNodeToRemove.remove()
                    }
                }
                arrayDomNodes = [];
            }

            if (newValue instanceof Array) {
                arrayDomNodes = newValue.map(val => typeof val === "object" ? val : document.createTextNode(val));
                let lastDomNodeInChain = this.domNode;
                for (let domNodeToAdd of arrayDomNodes) {
                    lastDomNodeInChain.parentNode.insertBefore(domNodeToAdd, lastDomNodeInChain.nextSibling);
                    lastDomNodeInChain = domNodeToAdd;
                }
                this.domNode.remove();
                this.domNode = arrayDomNodes[0];
            } else if (typeof newValue === "object") {
                // Deal with element
                // TODO: Check if instanceof HTMLElement. if not, what do we do with objects?
                this.domNode.replaceWith(newValue);
                this.domNode = newValue;
                console.log("##### Override object with element")
            } else {
                if (typeof lastValue === "object") {
                    // Handle an object becoming a string
                    let newTextNode = document.createTextNode(newValue);
                    this.domNode.replaceWith(newTextNode);
                    this.domNode = newTextNode;
                    console.log("##### Convert object to string: Created new text node")
                } else {
                    this.updateDomNodeCb(newValue);
                    console.log("##### Set normal textNode value")
                }
            }

            lastValue = newValue;
        }
    }

    updateNodeValue() {
        let attachedEvent = null;
        let expression = this.expressions[0];
        return () => {
            if (this.type === NodeTypes.ATTR_VALUE &&
                this.expressions.length === 1 && typeof this.expressions[0].lastResult === "function") {

                // TODO: change event if was called again with different value
                if (attachedEvent == null) {
                    let eventName = this.domNode.name.substring(2); // Remove the `on` from `onclick`
                    this.domNode.ownerElement.addEventListener(eventName, (...args) => attachedEvent(...args));
                    this.domNode.ownerElement.removeAttributeNode(this.domNode);
                    this.updateDomNodeCb();
                }
                attachedEvent = expression.lastResult;
            } else {
                // Replaces ids with expression values
                let newValue = this.initialValue;
                for (let expression of this.expressions) {
                    newValue = newValue.replace(expression.id, expression.lastResult)
                }

                // Attribute name cant be empty
                if (this.type === NodeTypes.ATTR_NAME && (newValue === "" || newValue == null)) {

                }
                // TODO: Save last domValue and only update if the value changed. spare dom updates yay
                this.updateDomNodeCb(newValue);
            }
        }
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
    }

    execute() {
        this.lastResult = this._cb();
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
    let templateTag = document.createElement("template");
    templateTag.innerHTML = html;

    if (templateTag.content.children.length > 1) {
        console.warn("HTMLefeTemplate: More than one child element in template, ignoring all other than the first")
    } else if (templateTag.content.children.length === 0) {
        throw "HTMEL: Component can't be empty"
    }
    return templateTag.content.firstElementChild;
}

function fillStrWithExpressions(str, expressions) {
    str = `<${str}>`;
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
    /** @type {Map<Element, {domNodeInfo: {domNode: HTMLElement, type: String, value, updateDomNodeCb: Function},
     *                       expressions: *[]}>} */
    let domNodeToExpressionsAndInfo = new Map();
    for (let expression of expressions) {
        let domNodeInfo = find(element, expression.id);
        if (domNodeToExpressionsAndInfo.has(domNodeInfo.domNode)) {
            let existing = domNodeToExpressionsAndInfo.get(domNodeInfo.domNode);

            // Check if the same node has different types of expressions (attrName and attrValue on the same attrNode)
            if (existing.domNodeInfo.type !== domNodeInfo.type) {
                let attributeText = `${existing.domNodeInfo.domNode.name}="${existing.domNodeInfo.domNode.value}"`;
                attributeText = fillStrWithExpressions(attributeText, [expression, ...existing.expressions]);
                if (existing.domNodeInfo.type === NodeTypes.ATTR_NAME && domNodeInfo.type === NodeTypes.ATTR_VALUE) {
                    throw `HTMEL: Attribute can't be bound in both name and value (${attributeText})`
                }
                throw `HTMEL: Node has multiple expression types: ${attributeText}`
            }

            existing.expressions.push(expression)
        } else {
            domNodeToExpressionsAndInfo.set(domNodeInfo.domNode, {
                domNodeInfo: domNodeInfo,
                expressions: [expression]
            });
        }
    }

    console.log("DomNodes + Expressions: ");
    console.log([...domNodeToExpressionsAndInfo.values()]);

    for (let {expressions, domNodeInfo} of domNodeToExpressionsAndInfo.values()) {
        // If template is inside html tag name, throw exception
        if (domNodeInfo.type === NodeTypes.HTML_ELEMENT) {
            let tagText = fillStrWithExpressions(domNodeInfo.domNode.localName, expressions);
            throw `HTMEL: Calculating element name is not allowed (${tagText})`
        }

        // Bind expressions to BoundNodes
        let boundNode = new BoundNode(expressions,
            domNodeInfo.domNode, domNodeInfo.type, domNodeInfo.updateDomNodeCb, domNodeInfo.initialValue);
        expressions.forEach(expression => expression.boundNode = boundNode);
    }
}

/**
 * Rerenders expressions when the values they use on propsObject change.
 * @param {Object} propsObject Holds the state of this htmel element
 * @param {Number} maxFps The maximum rate at which updates are applied to DOM. More FPS = smoother UI.
 * @returns {function(*=, ...[*]): Element}
 */
function htmel(propsObject, maxFps=60) {
    return (strings, ...expressionsCbs) => {
        let expressions = expressionsCbs.map(cb => new Expression(cb));
        let element = _createTemplateElement(_joinTemplateStrings(strings, expressions.map(e => e.id)));
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

        }, 1000 / maxFps, {leading: true});


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
