/* eslint-disable react/jsx-key */
import { Form, useFetcher } from "@remix-run/react";
import { useState } from "react";
import Downshift from "downshift";

import { CiSearch } from 'react-icons/ci';
import { relative } from "node:path/win32";

function StreamConfig(props: any) {
    // Responsible for Stream Management
    // Add seed users from Search or Lists, Delete Stream
    const { streamName, userLists } = props;
    const [search, setSearch] = useState(true);
    const [handle, setHandle] = useState("");

    let fetcher = useFetcher()
    let isAdding = fetcher.submission?.formData.get("intent") == "addSeedUser";
    if (isAdding) {
        return (<div>ADDING {`${fetcher.submission?.formData.get("seedUserHandle")}`} to stream...</div>)
    }

    return (
        <>
            <fetcher.Form
                method='post'
                action={`/streams/${streamName}`}
                className="sticky top-9 w-full mt-1 mx-auto flex items-center z-40"
            >
                <div
                    className="relative py-1 pl-2 grow hover:bg-white/95 bg-white/60 active:bg-white/95 grow-1 rounded-lg flex gap-0 align-center items-center border border-gray-200 backdrop-blur-lg">

                    <div
                        className=" p-2 flex align-middle justify-center items-center"
                        style={search ? { backgroundColor: "#f1f1f1 !important" } : { backgroundColor: "white !important" }}>
                        <CiSearch style={search ? { color: "#000000" } : { color: "#A5A4A4" }} />
                    </div>


                    <input
                        autoFocus
                        className="pl-2"
                        name="seedUserHandle"
                        type="text"
                        placeholder='Add handle ...'
                    />
                    <button
                        type='submit'
                        value="addSeedUser"
                        name="intent"
                        className={handle.length > 0 ? "" : "invisible"}
                        onClick={() => setHandle("")}
                    >
                        <span className="text-xs rounded-full bg-blue-400 px-2 py-1 mr-1 text-white">SUBMIT</span>
                    </button>
                </div >

            </fetcher.Form >

            {/* Add from User Lists 
            <div>
                <Downshift
                    itemToString={item => (item ? item.value : '')}
                >
                    {({
                        getInputProps,
                        getItemProps,
                        getLabelProps,
                        getMenuProps,
                        getToggleButtonProps,
                        isOpen,
                        inputValue,
                        highlightedIndex,
                        selectedItem,
                    }) => (
                        <div>
                            <span>Lists</span>
                            <button
                                {...getToggleButtonProps()}
                                className='ml-2 inline-block rounded border-2 border-black bg-green-800 px-2 py-1 text-white'
                            >
                                {isOpen ? 'close' : 'open'}
                            </button>
                            <ul
                                {...getMenuProps({
                                    style: { maxHeight: 300, overflowY: 'scroll' }
                                })}
                            >
                                {isOpen &&
                                    userLists
                                        .map((item: any, index: number) => (
                                            <li>
                                                <Form
                                                    method='post'
                                                    action={`/streams/${streamName}`}
                                                    className='top-2 my-8 flex'
                                                    {...getItemProps({
                                                        item,
                                                        key: item.properties.id,
                                                        index,
                                                        style: {
                                                            backgroundColor:
                                                                highlightedIndex === item.properties.id ? 'lightgray' : 'white',
                                                            fontWeight: selectedItem === item.properties.id ? 'bold' : 'normal',
                                                        },
                                                        disabled: true,
                                                    })}
                                                >
                                                    <input
                                                        type='hidden'
                                                        name="listId"
                                                        placeholder='enter list name'
                                                        className='flex-1 rounded border-2 border-black px-2 py-1'
                                                        value={item.properties.id}
                                                    />
                                                    <button
                                                        type='submit'
                                                        className='ml-2 inline-block rounded border-2 border-black bg-blue-600 px-2 py-1 text-white'
                                                        value="addSeedUsersFromList"
                                                        name="intent"
                                                    >
                                                        Import {item.properties.member_count} seed users from list '{item.properties.name}'
                                                    </button>
                                                </Form>
                                            </li>
                                        ))
                                }
                            </ul>
                        </div>
                    )}
                </Downshift>
            </div>
            */}



            {/*
                <p>startTime: {stream.properties.startTime}</p>
                <p>Following Network lastUpdatedAt: {stream.properties.followingLastUpdatedAt}</p>
                */}

            {/* Search for Seed Users */}
        </>

    )
}

export default StreamConfig