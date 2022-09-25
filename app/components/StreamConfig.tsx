/* eslint-disable react/jsx-key */
import { Form } from "@remix-run/react";
import Downshift from "downshift";

import { Tooltip } from "@mui/material";
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import { ButtonGroup } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

function StreamConfig({ userLists, streamName}) {
    // Responsible for Stream Management
    // Add seed users from Search or Lists, Delete Stream


    return (
        <div className="">
            <Form
                method='post'
                action={`/streams/${streamName}`}
                className="absolute top-16 w-full mt-1 mx-auto flex z-40"
            >
                <div className="rounded border-2 border-black">
                    <input
                        type='text'
                        name="seedUserHandle"
                        placeholder='Enter any Twitter handle'
                        className=' px-2 py-1'
                    />
                    <button
                        type='submit'
                        className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                        value="addSeedUser"
                        name="intent"
                    >
                        <SearchIcon />
                    </button>
                </div>

                {/* Delete Stream */}
                <button
                    type="submit"
                    className="rounded bg-blue-500  py-2 px-4 text-white hover:bg-blue-600 focus:bg-blue-400"
                    value="delete"
                    name="intent"
                >
                    <Tooltip title="Delete Stream">
                        <DeleteIcon />
                    </Tooltip>

                </button>
            </Form>

            {/* Add from User Lists */}
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
                            {/* <label {...getLabelProps()}>Import Seed Users From List</label>
                                <input className="ml-2 inline-block rounded border-2 border-black bg-blue px-2 py-1 text-black" {...getInputProps()} /> */}
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


            {/*
                <p>startTime: {stream.properties.startTime}</p>
                <p>Following Network lastUpdatedAt: {stream.properties.followingLastUpdatedAt}</p>
                */}

            {/* Search for Seed Users */}
        </div>
    )
}

export default StreamConfig