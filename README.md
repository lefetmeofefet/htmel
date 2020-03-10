# HTMEL
![npm bundle size](https://img.shields.io/bundlephobia/min/htmel)

`htmel` lets you write declarative html, with no special syntax 
to learn, while being small and blazing fast.

Time counter example:
```javascript
import htmel from "https://unpkg.com/htmel@latest/dist/htmel.min.js"

window.state = {
    age: 1
};

let element = htmel(state)`
<div>
    My age is ${() => state.age} seconds
</div>
`;

document.body.appendChild(element);
setInterval(() => state.age += 1, 1000)
```
Try it live on <a href="https://jsfiddle.net/Numbnut/6c7ovnuk/2/">JSFiddle</a>

# Overview
`htmel` tries to stay as unopinionated as possible by sticking to HTML with no 
special syntax. That makes defining a bound element simple:
```javascript
let element = htmel(state)`
<div>
    My name is ${() => state.text}
</div>
`;
state.text = "Inigo Montoya"
```

`element` is a regular HTML element. When `state.text` changes, `htmel` 
changes the element accordingly.

Making a static (non-bound) element is possible too: 
```javascript
let param = "text";
htmel()`<div>${param}</div>` 
```

_note that if the expression in not a function, it will never update._

### Speed
The updates to the DOM are fast. `htmel` saves references to DOM elements, and 
when state changes, it updates only the relevant elements instead of the whole 
root element.

To demonstrate that, consider the following code:
```javascript
let element = htmel(state)`
<div class="${() => state.class}">
    ${() => state.content}
    Some other irrelevant content...
</div>
`;
state.class = "classy";
state.content = "a content";
```
Instead of overwriting the whole div twice, `htmel` first updates the property 
`class`, then the textNode `content`. Notice that the other irrelevant text wasn't touched.

### API
`htmel` exports a single function that receives an optional state object and 
an HTML Template string, and returns an HTML element that's bound to the given 
state object. when a property changes in state, the element changes accordingly:
```javascript
import htmel from "https://unpkg.com/htmel@latest/dist/htmel.min.js"

window.state = {
    clicks: 0
}; 

let element = htmel(state)`
<button onclick=${() => state.clicks += 1}>
    I'm a button that's been clicked ${() => state.clicks} times
</button>
`;

document.body.appendChild(element);
```

`htmel` updates only what it needs to update by keeping references to elements
inside of the bound element, without inefficient dom-doffing.

In the above example, `htmel` hooked the `state` object so that when 
`state.clicks` is set, `htmel` update the relevant TextNode.

## Examples
Attribute value:
```javascript
`<div dir="${() => state.dir}">what is my direction?</div>`
```

CSS:
```javascript
`<style> 
    #my-element {
        color: ${() => state.color}
    }
</style>`
```

Events:
```javascript
`<button onclick=${() => state.a+=1}>
    ${() => state.a}
</button>`
```

Nested loop:
```javascript
window.state = {
    items: [{
        name: "Mojojojo"
    }, {
        name: "harambe"
    }]
};

let element = htmel(state)`
<div>
${() => state.items.map(item => htmel(item)`
    <div>${() => item.name}</div>
`)}
</div>
`;
// Modify only specific name
state.items[0].name += "s";

// Modify the whole list
state.items = [{name: "new name"}, {name: "another"}]
```

A single expression can contain multiple properties:
```javascript
`<div>${() => state.a + state.b}</div>`
```

A single dom node can contain multiple expressions:
```javascript
`<div style="color:${() => state.color}; width:${() => state.width}px;">`
```

Attribute names can also be calculated:
```javascript
`<div ${() => state.something}="10px">10px somewhere</div>`
```

Comprehensive example highlighting all the features of `htmel`:
```javascript
import htmel from "https://unpkg.com/htmel@latest/dist/htmel.min.js"

window.state = {
    name: "Inigo Montoystory",
    color: "red",

    age: 3,
    clicks: 1,

    placeholder: "this is hint",

    amAlive: true
};

window.innerState = {
    deathColor: "blue"
};

let element = htmel(state)`
<div>
    My name is <span style="color: ${() => state.color}">
        ${() => state.name}
    </span>

    <div>i will live ${() => state.age + 1}ever</div>
    <div>i am ${"static"}</div>

    <button onclick="${() => state.clicks += 1}">
        click me baby ${() => state.clicks} more time
    </button>

    <style>
     #thing {
        color: ${() => state.color};
     }
    </style>
    <div id="thing">colorful things</div>

    <input placeholder=${() => state.placeholder}>

    <div>
        ${() => state.amAlive ? "yes" : htmel(innerState)`
            <span style="color: ${() => innerState.deathColor}; font-size: ${() => innerState.deathColor === "blue" ? "40px" : "13px"};">NO</span>`}
    </div>

</div>
`;

// element is a regular html element
document.body.appendChild(element);

// modifying the state
state.name = "John Cena!!!";

// switching the color
setInterval(() => state.color = state.color === "blue" ? "red" : "blue", 500);
```
Try it live on <a href="https://jsfiddle.net/Numbnut/90h36g1L/">JSFiddle</a>

## How does it work?
Consider the following example:
```javascript
htmel(state)`
<div id="parent">
    <div id="child">${() => state.content}</div>
</div>
`;
state.content = "new content"
```

when the last line is called, `htmel` only updates `#child`'s content, by rerunning
the expression `() => state.content`.
`htmel` does several things to make that possible: 
* Wrap state object with setters and getters
    * Setters notify `htmel` that property has changed and should be rerendered. 
    (when `state.content = "new content"` is called)
    * Getters allow us to know which property corresponds to which expression in 
    the html: when `() => state.content` is called, the getter for `content` is 
    called, letting `htmel` know that `content` property corresponds to that 
    expression.
* Analyze the resulting HTML element to keep a reference to each of the nodes containing 
expressions. For example, `htmel` keeps a reference to the `#child`'s TextNode
which will be changed when `content`'s setter is called. It does so by inserting 
randomly generated IDs into the expressions, the then finding them.

In order to minimize the amount of DOM operations being done, `htmel` batches DOM
updates instead of immediately updating when setters are called.

### Why bound expression must be functions?
When an expression isn't a function, `htmel` can't rerun it when state's properties are 
changed - in fact, no property is linked to a static expression. Consider this expression:
```javascript
${state.a}
```
`htmel` can't possible know that the property `a` is linked to this expression, because only
the value of `a` is passed.

Its possible to use `eval` to convert expressions into callbacks (add `()=>` to the above code)
 but that would slow performance and be prone to errors and security problems.

## Contribution
Feel free to contact me about bugs, features and anything you'd like.

If you like this project and you feel like contributing, questions about the code and PRs are 
very welcome :)
