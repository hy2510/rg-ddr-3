# react-star-field-canvas

Configurable fly-through star field effect for HTML canvas with ReactJS.

<https://github.com/usernein/react-star-field-canvas/>

## Installing

```bash
npm install --save react-star-field-canvas
```

## Usage

```typescript
import { StarField } from "react-star-field-canvas";

export default function App() {
  return (
    <StarField
      followMouse={true}
      numStars={800}
      minSpeed={3}
      maxSpeed={5}
      className="starfield"
    />
  );
}
```

## Options

These are the default props:

```typescript
{
  followMouse = false,
  followContext = undefined,
  color = { r: 255, g: 255, b: 255 },
  glow = false,
  maxSpeed = 5,
  minSpeed = 2,
  numStars = 400,
  trails = false,
  trailColor = { r: 255, g: 255, b: 255 },
  longerTrails = false,
  pauseOnBlur = true,
  className = "",
}
```

The ```followContext``` option is the element or object to attach the mousemove listener to, if you enable ```followMouse``` but need it to respond to something other than the canvas, perhaps if the canvas is behind another fullscreen element. eg. you can use `document.body` as the context:

```typescript
<StarField
  followMouse={true}
  followContext={document.body}
  className="starfield"
/>
```

### Important: style the ```canvas``` yourself

In case you want to use it for a flying star field effect but with alternate colors (ie. not white stars on black space background), this script does not fill the canvas background at all. It *only* draws the stars.

You should style the canvas with CSS. There is no need to use height or width attributes on the ```canvas``` element since the CSS computed values are applied to the canvas in the script.

You can style the canvas element by passing through the prop `className` the class names you want to apply.

```typescript
<StarField
  followMouse={true}
  followContext={document.body}
  className="starfield"
/>
```

```css
.starfield {
  background-color: black;
  position: fixed;
  width: 100dvw;
  height: 100dvh;
  z-index: -10;
}
```

## Events

If you want to control the star field or change its options without re-rendering the StarField component (which will happen if you change the props with a state, for example), you have three events which you can dispatch:

| Event.name               | Description                              | Event.detail |
|--------------------------|------------------------------------------| --- |
| `star-field-start`       | Start the star field                     |  `undefined`
| `star-field-stop`        | Stop the star field                      |  `undefined`
| `star-field-reset`       | Reset the star field                     |  `undefined`
| `star-field-set-options` | Update the star field options on-the-fly | `Partial<StarFieldOptions>`

### Updating options on-the-fly

The following code will change the color of the stars every 2 seconds:

```typescript
setInterval(() => {
  const changeColor = new CustomEvent("star-field-set-options", {
    detail: {
      color: {
        r: Math.floor((Math.sin(Date.now() / 1000) + 1) * 128),
        g: Math.floor((Math.sin(Date.now() / 1000 + 2) + 1) * 128),
        b: Math.floor((Math.sin(Date.now() / 1000 + 4) + 1) * 128),
      },
    } as StarFieldOptions,
  });

  window.dispatchEvent(changeColor);
}, 2000);

```

## Demo

Play and experiment with the demo at CodeSandbox: <https://codesandbox.io/s/react-star-field-canvas-q88fkh/>
