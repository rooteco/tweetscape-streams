
import DownshiftUntyped, { DownshiftInterface } from "downshift";

import { Form, useActionData, useCatch, useLoaderData } from "@remix-run/react";

const getItems = (value: any) => {
    return [{ value: "1" }, { value: "2" }]
}
const Downshift: DownshiftInterface<string> = DownshiftUntyped;

// const stateReducer = (state, changes) => {
//     if (changes.type === Downshift.stateChangeTypes.blurButton) {
//         return { ...changes, isOpen: true }
//     }
//     return changes
// }

const itemToString = item => (item ? item.username : '')

export async function searchUsers(
    api: any,
    userValue: string
) {
    const users = await api.v1.searchUsers(userValue);
    console.log("IN SEARCH!!");
    console.log(users);
    return users.data;
}

export const SearchBox = ({ items, placeholder, errors, api }: any) => {
    return (
        <div>
            <h1>Autocomplete rocks!</h1>
            <div>
                <Downshift itemToString={itemToString}>
                    {({
                        getLabelProps,
                        getInputProps,
                        getMenuProps,
                        getItemProps,
                        getToggleButtonProps,
                        clearSelection,
                        highlightedIndex,
                        selectedItem,
                        isOpen,
                        inputValue,
                    }) => (
                        <div>
                            <label {...getLabelProps()}>Select a Star Wars Character</label>
                            <input {...getInputProps()} />
                            <button {...getToggleButtonProps()}>
                                {isOpen ? 'close' : 'open'}
                            </button>
                            {selectedItem ? (
                                <button onClick={clearSelection}>x</button>
                            ) : null}
                            <ul
                                {...getMenuProps({
                                    style: { height: 200, overflowY: 'scroll' },
                                })}
                            >
                                {isOpen
                                    ? searchUsers(api, inputValue).map((item, index) => (
                                        <li
                                            {...getItemProps({
                                                item,
                                                key: item.id,
                                                style: {
                                                    backgroundColor:
                                                        index === highlightedIndex ? 'gray' : null,
                                                },
                                            })}
                                        >
                                            {item.value}
                                        </li>
                                    ))
                                    : null}
                            </ul>
                        </div>
                    )}
                </Downshift>
            </div>
        </div>
    )
}

export default SearchBox;