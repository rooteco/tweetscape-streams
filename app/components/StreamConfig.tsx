/* eslint-disable react/jsx-key */
import { Form } from "@remix-run/react";
import { useState } from "react";
import Downshift from "downshift";

import { Tooltip } from "@mui/material";
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import { ButtonGroup } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Button } from '@mui/material';

import { styled, alpha } from '@mui/material/styles';

import Toolbar from '@mui/material/Toolbar';
import InputBase from '@mui/material/InputBase';

const Search = styled('div')(({ theme }) => ({
    borderRadius: "4px",
    flexGrow: 1,
    alignItems: 'center',
    display: 'flex',
    padding: '2px 4px',
    backgroundColor: alpha(theme.palette.common.white, 0.65),
    '&:hover': {
        backgroundColor: alpha(theme.palette.common.white, 0.95),
    },
    '&:focus': {
        backgroundColor: alpha(theme.palette.common.white, 0.95),
    },
    width: '100%',
    maxWidth: '100%',
    [theme.breakpoints.up('sm')]: {
        marginLeft: 0,
        width: 'auto',
    },
}));

const ImportSwitch = styled('div')(({ theme }) => ({
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
    color: 'inherit',
    '& .MuiInputBase-input': {
        padding: theme.spacing(1, 1, 1, 0),
        // vertical padding + font size from searchIcon
        paddingLeft: "0.5rem",
        transition: theme.transitions.create('width'),
        width: '100%',
        maxWidth: "100%",
        [theme.breakpoints.up('sm')]: {
            width: '16ch',
            '&:focus': {
                width: '20ch',
            },
        },
    },
}));


function StreamConfig(props: any) {
    // Responsible for Stream Management
    // Add seed users from Search or Lists, Delete Stream
    const { streamName, userLists } = props;
    const [handle, setHandle] = useState("");

    return (
        <>
            <Form
                method='post'
                action={`/streams/${streamName}`}
                className="sticky top-1 w-full mt-1 mx-auto flex items-center z-40"
            >
                <Search className="grow-1 rounded flex space-x-0 border border-gray-200 backdrop-blur-lg">
                    <ImportSwitch>
                        <ButtonGroup className="bg-white" sx={{ border: '1 px solid #e5e5e5' }}>
                            <Tooltip title="Import from List">
                                <Button className="border border-gray-200">
                                    <ReceiptLongIcon />
                                </Button>
                            </Tooltip>
                            <Tooltip title="Import from Search">
                                <Button sx={{ border: '1 px solid #e5e5e5' }}>
                                    <SearchIcon />
                                </Button>
                            </Tooltip>
                        </ButtonGroup>
                    </ImportSwitch>

                    {/* <StyledInputBase
                        autoFocus
                        name="seedUserHandle"
                        value={handle}
                        placeholder='Search handle ...'
                        inputProps={{ 'aria-label': 'search' }}
                        onChange={(e) => setHandle(e.target.value)}
                    /> */}
                    <input
                        name="seedUserHandle"
                        type="text"
                        placeholder='Search handle ...'
                    />
                    <button
                        type='submit'
                        className={handle.length > 0 ? 'ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white' : 'invisible'}
                        value="addSeedUser"
                        name="intent"
                        onClick={() => setHandle("")}
                    >
                        <SearchIcon />
                    </button>
                </Search>

                {/* Delete Stream */}
                <button
                    type="submit"
                    className="shrink w-8 h-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 focus:bg-blue-400"
                    value="delete"
                    name="intent"
                >
                    <Tooltip title="Delete Stream">
                        <DeleteIcon sx={{ fontSize: "1.5rem" }} />
                    </Tooltip>

                </button>
            </Form>

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