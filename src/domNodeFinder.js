// TODO: Change to node types ($0.nodeType) like in the browser

// TODO: Chage return type to UpdatableDomNode for easy jsdocing
const NodeTypes = {
    TEXT_NODE: "Text/CSS node",
    ATTR_VALUE: "Attribute value",
    ATTR_NAME: "Attribute name",
    HTML_ELEMENT: "HTML Element"
};

/**
 * Receives a textNode and divider (`textToMakeNode`), and breaks up the textNode into 3 textNodes: before, after and
 * middle, and returns the middle. The middle is the part that's equal to `textToMakeNode`. the other parts are
 * inserted into the DOM.
 * Example: node "123" with divider "2" will return insert "1" and "3" into the DOM, and return "2".
 * node "23" with divider "2" will insert "3" into DOM and return "2".
 * @param {Text} textNode
 * @param {String} textToMakeNode
 * @returns {Text}
 * @private
 */
function _breakUpTextNodeToSmallerNodes(textNode, textToMakeNode) {
    let wholeText = textNode.data;
    let textIndex = textNode.data.indexOf(textToMakeNode);

    // Insert node before
    if (textIndex !== 0) {
        _insertBefore(
            document.createTextNode(wholeText.substring(0, textIndex)),
            textNode
        );
    }

    // Insert node after
    if (textIndex + textToMakeNode.length < wholeText.length) {
        _insertAfter(
            document.createTextNode(wholeText.substring(textIndex + textToMakeNode.length)),
            textNode
        );
    }

    textNode.data = wholeText.substring(textIndex, textIndex + textToMakeNode.length);
    return textNode;
}

function _insertBefore(newNode, node) {
    return node.parentNode.insertBefore(newNode, node);
}

function _insertAfter(newNode, node) {
    return node.parentNode.insertBefore(newNode, node.nextSibling);
}



/**
 *
 * @param rootElement
 * @param searchValue
 * @returns {{domNode: HTMLElement, type: String, value, updateDomNodeCb: Function}}
 */
function find(rootElement, searchValue) {
    const xpathSearchers = [
        {
            // Finds TextNode by text
            xpath: `.//text()[contains(., '${searchValue}')]`,
            resolver: textNode => {
                const parentElement = textNode.parentNode;
                textNode = _breakUpTextNodeToSmallerNodes(textNode, searchValue);
                const textContent = textNode.data;

                console.log(`Found ${textContent} in textNode. node: `, textNode);
                console.log(`Containing element: `, parentElement);
                return {
                    domNode: textNode,
                    type: NodeTypes.TEXT_NODE,
                    initialValue: textContent,
                    updateDomNodeCb: newText => textNode.data = newText
                }
            }
        }, {
            // Finds Attribute by value
            xpath: `.//@*[contains(., '${searchValue}')]`,
            resolver: attributeNode => {
                const attrName = attributeNode.name;
                const attrValue = attributeNode.value;
                const ownerElement = attributeNode.ownerElement;

                console.log(`Found ${searchValue} in attribute value. node: `, attributeNode);
                console.log(`Containing element: `, ownerElement);

                return {
                    domNode: attributeNode,
                    type: NodeTypes.ATTR_VALUE,
                    initialValue: attrValue,
                    updateDomNodeCb: newAttributeValue => attributeNode.value = newAttributeValue
                }
            }
        }, {
            // Finds Attribute by attribute's name
            xpath: `.//@*[contains(name(), '${searchValue}')]`,
            resolver: attributeNode => {
                let attrName = attributeNode.name;
                const attrValue = attributeNode.value;
                const ownerElement = attributeNode.ownerElement;

                console.log(`Found ${searchValue} in attribute name. node: `, attributeNode);
                console.log(`Containing element: `, ownerElement);

                return {
                    domNode: attributeNode,
                    type: NodeTypes.ATTR_NAME,
                    initialValue: attrName,
                    updateDomNodeCb: newAttributeName => {
                        let currentAttrValue = ownerElement.getAttribute(attrName);

                        ownerElement.removeAttribute(attrName);
                        if (newAttributeName != null && newAttributeName !== "") {
                            ownerElement.setAttribute(newAttributeName, currentAttrValue);
                            attrName = newAttributeName;
                        }
                    }
                }
            }
        }, {
            // Finds HTML elements by tag names
            xpath: `.//*[contains(name(), '${searchValue}')]`,
            resolver: elementNode => {
                console.log(`Found ${searchValue} in HTMLElement. node: `, elementNode);
                console.log(`Containing element: `, elementNode.parentNode);
                let lastAttachedElement = elementNode;
                return {
                    domNode: elementNode,
                    type: NodeTypes.HTML_ELEMENT,
                    initialValue: elementNode,
                    updateDomNodeCb: newHtmlElement => {
                        lastAttachedElement.replaceWith(newHtmlElement);
                        lastAttachedElement = newHtmlElement;
                    }
                }
            }
        }
    ];

    for (let searcher of xpathSearchers) {
        let result = document.evaluate(
            searcher.xpath,
            rootElement,
            null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if (result != null) {
            return searcher.resolver(result);
        }
    }
}

export {find, NodeTypes}
