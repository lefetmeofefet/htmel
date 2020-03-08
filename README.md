# HTMEL
![npm bundle size](https://img.shields.io/bundlephobia/min/htmel)

`htmel` lets you write declarative html, with no special syntax 
to learn, while being small and blazing fast.


Hello world example:
```javascript
import htmel from "https://unpkg.com/htmel@latest/dist/htmel.min.js"

window.state = {
    who: "World?"
}; 

let boundElement = htmel(state)`
<div>
    Hello ${() => state.who}
</div>
`;

document.body.appendChild(boundElement);
state.who = "World!"
```
Try it live on <a href="https://jsfiddle.net/x4z3w6sr/">JSFiddle</a>

# Overview
`htmel` tries to stay as unopinionated as possible by sticking to HTML with no 
special syntax. That makes defining a bound element simple:
```javascript
let element = htmel(state)`<div>${() => state.text}</div>`
state.text = "i am text"
```

`element` is a regular HTML element, it can be referenced and changed in runtime.

Apart from creating the element, `htmel` also keeps a reference to the div's
content, changing it each time `state.text` is being set.

### API
`htmel` exports a single function that receives a state object and an HTML 
Template string, and returns an HTML element that's bound to the given state 
object. when a property changes in state, the element changes:
```javascript
import htmel from "https://unpkg.com/htmel@latest/dist/htmel.min.js"

window.state = {
    clicks: 0
}; 

let boundElement = htmel(state)`
<button onclick=${() => () => state.clicks += 1}>
    I'm a button that's been clicked ${() => state.clicks} times
</button>
`;

document.body.appendChild(boundElement);
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
`<button onclick=${() => () => state.a+=1}>
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

htmel(state)`
<div>
${() => state.items.map(item => htmel(item)`
    <div>${item.name}</div>
`)}
</div>
`
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
    hidden: true,

    amAlive: true
};

window.innerState = {
    deathColor: "blue"
};

let boundElement = htmel(state)`
    <div>
        My name is <span style="color: ${() => state.color}">
            ${() => state.name}
        </span>

        <div>i will live ${() => state.age + 1}ever</div>

        <button onclick="${() => () => state.clicks += 1}">
            click me baby ${() => state.clicks} more time
        </button>

        <style>
         #thing {
            color: ${() => state.color};
         }
        </style>
        <div id="thing">colorful things</div>

        <input placeholder=${() => state.placeholder}>
        <div ${() => state.hidden ? "hidden" : ""}>hidden</div>

        <div>
            ${() => state.amAlive ? "yes" : htmel(innerState)`
                <span style="color: ${() => innerState.deathColor}; font-size: ${() => innerState.deathColor === "blue" ? "40px" : "13px"};">NO</span>`}
        </div>

    </div>
`;

// boundElement is a regular html element
document.body.appendChild(boundElement);

// modifying the state
state.name = "John Cena!!!";

// switching the color
setInterval(() => state.color = state.color === "blue" ? "red" : "blue", 500);
```
Try it live <a href="https://jsfiddle.net/0xy27kdr/">here</a>

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

### Why are the values inside the template Functions?
If the expressions inside the template weren't functions, `htmel` wouldn't be 
able to rerun them when state's properties are changed, it's simple as that.
I could use `eval` to convert expressions into callbacks but that would be dirty.

## Contribution
Feel free to suggest changes and open PRs :)
