# HTMEL
`htmel` is a small (6kb) JavaScript library that lets you create declarative html templates, with no special syntax 
to learn, simple to use and extremely fast.

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

## Example
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

// Using htmlefet to bind state object to an html template
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
