/** @type {import('tailwindcss').Config} */
import daisyui from "daisyui"

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./node_modules/react-tailwindcss-select/dist/index.esm.js",
    ],
    theme: {
        extend: {},
    },
    plugins: [
        daisyui,
    ],
}
