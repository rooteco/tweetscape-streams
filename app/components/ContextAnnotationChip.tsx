import { Form, useTransition } from "@remix-run/react";


function ContextAnnotationChip({ keyValue, value, caEntities, hideTopics }) {
    if (!caEntities) {
        caEntities = []
    }
    let transition = useTransition();
    let isFetching = transition.submission?.formData.get("caEntityCount") == keyValue;
    if (isFetching) {
        return (
            <p>LOADING...</p>
        )
    }

    let bg
    if (hideTopics.indexOf(keyValue) > -1) {
        bg = "bg-red-300 hover:bg-blue-500"
    } else if (caEntities.indexOf(keyValue) > -1) {
        bg = 'bg-green-200 hover:bg-blue-500'
    } else {
        bg = 'bg-blue-200 hover:bg-blue-300'
    }

    return (
        <Form
            method="post"
        >
            <span
                className={`
                    ${bg}
                    px-4 py-2 rounded-full text-gray-500  font-semibold text-sm flex align-center w-max cursor-pointer active:bg-gray-300 transition duration-300 ease`}>
                <button className="" type="submit" name="caEntityCount" value={keyValue}>
                    {`${keyValue} ${value ? ', ' + value : ''}`}
                </button>
                <button
                    type="submit"
                    name="hideTopic"
                    value={keyValue}
                    className="bg-transparent hover:bg-red-200 focus:outline-none">
                    <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="times"
                        className="w-3 ml-3" role="img" xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 352 512">
                        <path fill="currentColor"
                            d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z">
                        </path>
                    </svg>
                </button>
            </span>
        </Form>
    )
}

export default ContextAnnotationChip;